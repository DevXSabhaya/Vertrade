import type { ConfigService } from '@core/config/config.service';
import type { MarketDataService } from '@modules/market-data/market-data.service';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import { InvalidTradeDefinitionException } from '@modules/trading-engine/exceptions';
import { QueueWorker } from './queue-worker.service';
import { LockManager } from './lock/lock-manager';
import { QueueMetricsService } from './metrics/queue-metrics.service';
import { QueueItem } from './models/queue-item.aggregate';
import { QueueItemType } from './models/queue-item-type.enum';
import { QueueItemState } from './models/queue-item-state.enum';
import { FakeClock } from './testing/fake-clock';
import { FakeQueueItemRepository } from './testing/fake-queue-item-repository';
import {
  buildRequest,
  buildResolvedInstrument,
} from './testing/build-fixtures';
import {
  OrderCompletedEvent,
  OrderFailedEvent,
  OrderLockedEvent,
  OrderRetryEvent,
} from './events';

function fakeTradeSnapshot(id: string): TradeSnapshot {
  return { id } as TradeSnapshot;
}

function buildItem(
  clock: FakeClock,
  overrides: { instrumentToken?: string } = {},
): QueueItem {
  return new QueueItem(
    `item-${overrides.instrumentToken ?? 'TOKEN-1'}-${clock.now().getTime()}`,
    `idem-${overrides.instrumentToken ?? 'TOKEN-1'}-${Math.random()}`,
    QueueItemType.CREATE_TRADE,
    buildRequest(),
    buildResolvedInstrument({
      instrumentToken: overrides.instrumentToken ?? 'TOKEN-1',
    }),
    clock.now(),
  );
}

describe('QueueWorker', () => {
  let clock: FakeClock;
  let lockManager: LockManager;
  let tradingEngineService: jest.Mocked<
    Pick<TradingEngineService, 'createTrade'>
  >;
  let eventBus: IEventBus;
  let publishSpy: jest.Mock;
  let metrics: QueueMetricsService;
  let repository: FakeQueueItemRepository;
  let configService: ConfigService;
  let worker: QueueWorker;

  const retryOptions = {
    maxRetries: 2,
    baseDelayMs: 10,
    maxDelayMs: 100,
    jitterRatio: 0,
  };

  beforeEach(() => {
    clock = new FakeClock();
    lockManager = new LockManager(clock, 30_000);
    tradingEngineService = { createTrade: jest.fn() };
    publishSpy = jest.fn();
    eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    metrics = new QueueMetricsService();
    repository = new FakeQueueItemRepository();
    configService = { killSwitchEnabled: false } as unknown as ConfigService;
    worker = new QueueWorker(
      lockManager,
      tradingEngineService as unknown as TradingEngineService,
      eventBus,
      clock,
      retryOptions,
      metrics,
      repository,
      configService,
      {
        subscribeInstrument: () => Promise.resolve(),
      } as unknown as MarketDataService,
    );
  });

  it('processes an item through LOCKED -> PROCESSING -> SUBMITTED -> COMPLETED', async () => {
    tradingEngineService.createTrade.mockReturnValue(
      fakeTradeSnapshot('trade-1'),
    );
    const item = buildItem(clock);

    await worker.enqueue(item, 'owner-1');

    expect(item.state).toBe(QueueItemState.COMPLETED);
    expect(item.resultTradeId).toBe('trade-1');
    expect(
      publishSpy.mock.calls.some(
        ([e]: [unknown]) => e instanceof OrderLockedEvent,
      ),
    ).toBe(true);
    expect(
      publishSpy.mock.calls.some(
        ([e]: [unknown]) => e instanceof OrderCompletedEvent,
      ),
    ).toBe(true);
  });

  it('subscribes the resolved instrument to market data once the trade is submitted', async () => {
    const subscribeInstrument = jest.fn().mockResolvedValue(undefined);
    const workerWithSpy = new QueueWorker(
      lockManager,
      tradingEngineService as unknown as TradingEngineService,
      eventBus,
      clock,
      retryOptions,
      metrics,
      repository,
      configService,
      { subscribeInstrument } as unknown as MarketDataService,
    );
    tradingEngineService.createTrade.mockReturnValue(
      fakeTradeSnapshot('trade-sub-1'),
    );
    const item = buildItem(clock, { instrumentToken: 'SUB-TOKEN' });

    await workerWithSpy.enqueue(item, 'owner-1');

    expect(subscribeInstrument).toHaveBeenCalledTimes(1);
    const [instrument, subscriberId] = subscribeInstrument.mock.calls[0] as [
      { instrumentToken: string },
      string,
    ];
    expect(instrument.instrumentToken).toBe('SUB-TOKEN');
    expect(subscriberId).toBe('trade:trade-sub-1');
  });

  it('a market-data subscription failure never fails the trade submission itself', async () => {
    const subscribeInstrument = jest
      .fn()
      .mockRejectedValue(new Error('provider down'));
    const workerWithSpy = new QueueWorker(
      lockManager,
      tradingEngineService as unknown as TradingEngineService,
      eventBus,
      clock,
      retryOptions,
      metrics,
      repository,
      configService,
      { subscribeInstrument } as unknown as MarketDataService,
    );
    tradingEngineService.createTrade.mockReturnValue(
      fakeTradeSnapshot('trade-sub-2'),
    );
    const item = buildItem(clock, { instrumentToken: 'SUB-TOKEN-2' });

    await workerWithSpy.enqueue(item, 'owner-1');

    expect(item.state).toBe(QueueItemState.COMPLETED);
  });

  it('releases the lock after completion, allowing a later item on the same instrument through', async () => {
    tradingEngineService.createTrade.mockReturnValue(
      fakeTradeSnapshot('trade-1'),
    );
    const item1 = buildItem(clock);
    await worker.enqueue(item1, 'owner-1');

    expect(lockManager.isLocked('TOKEN-1')).toBe(false);
  });

  it('processes items strictly sequentially, in submission order', async () => {
    const order: string[] = [];
    tradingEngineService.createTrade.mockImplementation((params) => {
      order.push(params.instrumentToken);
      return fakeTradeSnapshot(`trade-${params.instrumentToken}`);
    });

    const itemA = buildItem(clock, { instrumentToken: 'TOKEN-A' });
    const itemB = buildItem(clock, { instrumentToken: 'TOKEN-B' });
    const itemC = buildItem(clock, { instrumentToken: 'TOKEN-C' });

    const promiseA = worker.enqueue(itemA, 'owner');
    const promiseB = worker.enqueue(itemB, 'owner');
    const promiseC = worker.enqueue(itemC, 'owner');
    await Promise.all([promiseA, promiseB, promiseC]);

    expect(order).toEqual(['TOKEN-A', 'TOKEN-B', 'TOKEN-C']);
  });

  describe('retry', () => {
    it('retries a transient failure and eventually completes', async () => {
      tradingEngineService.createTrade
        .mockImplementationOnce(() => {
          throw new Error('transient network blip');
        })
        .mockReturnValueOnce(fakeTradeSnapshot('trade-1'));

      const item = buildItem(clock);
      await worker.enqueue(item, 'owner-1');

      expect(item.state).toBe(QueueItemState.COMPLETED);
      expect(item.attempts).toBe(1);
      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof OrderRetryEvent,
        ),
      ).toBe(true);
      expect(metrics.snapshot(0, 0).retryCount).toBe(1);
    });

    it('exhausts retries and ends FAILED after maxRetries', async () => {
      tradingEngineService.createTrade.mockImplementation(() => {
        throw new Error('persistent failure');
      });

      const item = buildItem(clock);
      await worker.enqueue(item, 'owner-1');

      expect(item.state).toBe(QueueItemState.FAILED);
      // attempts counts retries (not the initial try): maxRetries retries
      // happen, then the (maxRetries + 1)th try gives up instead of retrying.
      expect(item.attempts).toBe(retryOptions.maxRetries);
      expect(tradingEngineService.createTrade).toHaveBeenCalledTimes(
        retryOptions.maxRetries + 1,
      );
      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof OrderFailedEvent,
        ),
      ).toBe(true);
      expect(metrics.snapshot(0, 0).failed).toBe(1);
    });

    it('never retries a permanent (validation-shaped) failure', async () => {
      tradingEngineService.createTrade.mockImplementation(() => {
        throw new InvalidTradeDefinitionException('impossible definition');
      });

      const item = buildItem(clock);
      await worker.enqueue(item, 'owner-1');

      expect(item.state).toBe(QueueItemState.FAILED);
      expect(item.attempts).toBe(0);
      expect(tradingEngineService.createTrade).toHaveBeenCalledTimes(1);
    });
  });

  describe('locking', () => {
    it('retries when the instrument is already locked, and succeeds once the lock is released', async () => {
      lockManager.tryAcquire('TOKEN-1', 'someone-else');
      tradingEngineService.createTrade.mockReturnValue(
        fakeTradeSnapshot('trade-1'),
      );

      const item = buildItem(clock);
      const processing = worker.enqueue(item, 'owner-1');

      // Release the foreign lock before the (synchronous, no-real-timer) retry loop exhausts.
      lockManager.release('TOKEN-1', 'someone-else');
      await processing;

      expect(item.state).toBe(QueueItemState.COMPLETED);
    });

    it('a stale (timed-out) lock does not block a fresh acquisition', async () => {
      lockManager.tryAcquire('TOKEN-1', 'crashed-worker');
      clock.advanceBy(30_001);
      tradingEngineService.createTrade.mockReturnValue(
        fakeTradeSnapshot('trade-1'),
      );

      const item = buildItem(clock);
      await worker.enqueue(item, 'owner-1');

      expect(item.state).toBe(QueueItemState.COMPLETED);
      expect(item.attempts).toBe(0);
    });

    it('fails permanently if the instrument stays locked beyond maxRetries', async () => {
      lockManager.tryAcquire('TOKEN-1', 'forever-owner');
      const item = buildItem(clock);

      await worker.enqueue(item, 'owner-1');

      expect(item.state).toBe(QueueItemState.FAILED);
      expect(tradingEngineService.createTrade).not.toHaveBeenCalled();
    });
  });

  describe('graceful shutdown', () => {
    it('onModuleDestroy pauses the worker and waits for in-flight processing to finish', async () => {
      tradingEngineService.createTrade.mockReturnValue(
        fakeTradeSnapshot('trade-1'),
      );
      const item1 = buildItem(clock, { instrumentToken: 'TOKEN-A' });
      const item2 = buildItem(clock, { instrumentToken: 'TOKEN-B' });

      const p1 = worker.enqueue(item1, 'owner');
      await worker.onModuleDestroy();
      await p1;

      expect(item1.state).toBe(QueueItemState.COMPLETED);
      expect(worker.isPaused()).toBe(true);

      // A new item enqueued after shutdown is left untouched (paused).
      await worker.enqueue(item2, 'owner');
      expect(item2.state).toBe(QueueItemState.QUEUED);
    });
  });

  describe('kill switch pause', () => {
    it('leaves a queued item untouched while the kill switch is enabled', async () => {
      configService = { killSwitchEnabled: true } as unknown as ConfigService;
      worker = new QueueWorker(
        lockManager,
        tradingEngineService as unknown as TradingEngineService,
        eventBus,
        clock,
        retryOptions,
        metrics,
        repository,
        configService,
        {
          subscribeInstrument: () => Promise.resolve(),
        } as unknown as MarketDataService,
      );
      const item = buildItem(clock);

      await worker.enqueue(item, 'owner-1');

      expect(item.state).toBe(QueueItemState.QUEUED);
      expect(tradingEngineService.createTrade).not.toHaveBeenCalled();
    });
  });
});
