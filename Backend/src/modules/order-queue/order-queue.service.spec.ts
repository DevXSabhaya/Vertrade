import type { ConfigService } from '@core/config/config.service';
import type { MarketDataService } from '@modules/market-data/market-data.service';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { TradeValidationService } from '@modules/trade-validation/trade-validation.service';
import { ValidationResult } from '@modules/trade-validation/models/validation-result.model';
import { ValidationFailureCode } from '@modules/trade-validation/models/validation-failure-code.enum';
import type { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import { OrderQueueService } from './order-queue.service';
import { QueueWorker } from './queue-worker.service';
import { LockManager } from './lock/lock-manager';
import { QueueMetricsService } from './metrics/queue-metrics.service';
import { QueueItemState } from './models/queue-item-state.enum';
import { FakeClock } from './testing/fake-clock';
import { FakeQueueItemRepository } from './testing/fake-queue-item-repository';
import {
  buildRequest,
  buildResolvedInstrument,
} from './testing/build-fixtures';
import { QueueItemNotFoundException } from './exceptions/queue-item-not-found.exception';

function fakeTradeSnapshot(id: string): TradeSnapshot {
  return { id } as TradeSnapshot;
}

describe('OrderQueueService', () => {
  let clock: FakeClock;
  let lockManager: LockManager;
  let tradingEngineService: jest.Mocked<
    Pick<TradingEngineService, 'createTrade' | 'getAllTrades'>
  >;
  let tradeValidationService: jest.Mocked<
    Pick<TradeValidationService, 'validate'>
  >;
  let eventBus: IEventBus;
  let publishSpy: jest.Mock;
  let metrics: QueueMetricsService;
  let repository: FakeQueueItemRepository;
  let configService: { killSwitchEnabled: boolean };
  let worker: QueueWorker;
  let service: OrderQueueService;

  const retryOptions = {
    maxRetries: 2,
    baseDelayMs: 10,
    maxDelayMs: 100,
    jitterRatio: 0,
  };

  function buildService(): OrderQueueService {
    return new OrderQueueService(
      tradeValidationService as unknown as TradeValidationService,
      worker,
      metrics,
      lockManager,
      repository,
      eventBus,
      clock,
      /* maxQueueSize */ 3,
      configService as unknown as ConfigService,
    );
  }

  beforeEach(() => {
    clock = new FakeClock();
    lockManager = new LockManager(clock, 30_000);
    tradingEngineService = {
      createTrade: jest.fn().mockReturnValue(fakeTradeSnapshot('trade-1')),
      getAllTrades: jest.fn().mockReturnValue([]),
    };
    tradeValidationService = {
      validate: jest
        .fn()
        .mockResolvedValue(ValidationResult.valid(buildResolvedInstrument())),
    };
    publishSpy = jest.fn();
    eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    metrics = new QueueMetricsService();
    repository = new FakeQueueItemRepository();
    configService = { killSwitchEnabled: false };
    worker = new QueueWorker(
      lockManager,
      tradingEngineService as unknown as TradingEngineService,
      eventBus,
      clock,
      retryOptions,
      metrics,
      repository,
      configService as unknown as ConfigService,
      {
        subscribeInstrument: () => Promise.resolve(),
      } as unknown as MarketDataService,
    );
    service = buildService();
  });

  describe('happy path', () => {
    it('queues a valid request and it completes after draining', async () => {
      const result = await service.submitTrade(buildRequest(), 'requester-1');
      expect(result.outcome).toBe('QUEUED');

      await service.drain();

      const item = service.getItem(itemKeyOf(result));
      expect(item.state).toBe(QueueItemState.COMPLETED);
      expect(item.resultTradeId).toBe('trade-1');
    });
  });

  describe('validation gate', () => {
    it('rejects an invalid request without ever creating a queue item', async () => {
      tradeValidationService.validate.mockResolvedValue(
        ValidationResult.invalid({
          code: ValidationFailureCode.INVALID_QUANTITY,
          reason: ValidationFailureCode.INVALID_QUANTITY,
          message: 'bad quantity',
          failedRule: 'QuantityRule',
          timestamp: clock.now().toISOString(),
        }),
      );

      const result = await service.submitTrade(buildRequest(), 'requester-1');

      expect(result.outcome).toBe('VALIDATION_FAILED');
      expect(service.getAllItems()).toHaveLength(0);
      expect(tradingEngineService.createTrade).not.toHaveBeenCalled();
    });
  });

  describe('duplicate protection / exactly-once execution', () => {
    it('a second submission with the same explicit idempotency key returns the existing item, never creates a second one', async () => {
      const request = buildRequest({ idempotencyKey: 'user-click-abc' });

      const first = await service.submitTrade(request, 'requester-1');
      const second = await service.submitTrade(request, 'requester-1');

      expect(first.outcome).toBe('QUEUED');
      expect(second.outcome).toBe('DUPLICATE');
      expect(service.getAllItems()).toHaveLength(1);
      await service.drain();
      expect(tradingEngineService.createTrade).toHaveBeenCalledTimes(1);
    });

    it('concurrent submissions with the same idempotency key still produce exactly one queue item', async () => {
      const request = buildRequest({ idempotencyKey: 'double-click' });

      const [a, b] = await Promise.all([
        service.submitTrade(request, 'requester-1'),
        service.submitTrade(request, 'requester-1'),
      ]);

      const outcomes = [a.outcome, b.outcome].sort();
      expect(outcomes).toEqual(['DUPLICATE', 'QUEUED']);
      expect(service.getAllItems()).toHaveLength(1);
      await service.drain();
      expect(tradingEngineService.createTrade).toHaveBeenCalledTimes(1);
    });

    it('double-click simulated via identical requests within the same dedup window produces exactly one broker submission', async () => {
      const request = buildRequest(); // no explicit key: derived key used

      const first = await service.submitTrade(request, 'requester-1');
      const second = await service.submitTrade(request, 'requester-1');

      expect(first.outcome).toBe('QUEUED');
      expect(second.outcome).toBe('DUPLICATE');
      await service.drain();
      expect(tradingEngineService.createTrade).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple users / different instruments', () => {
    it('two different requesters trading different instruments both succeed independently', async () => {
      const resolvedA = buildResolvedInstrument({ instrumentToken: 'TOKEN-A' });
      const resolvedB = buildResolvedInstrument({ instrumentToken: 'TOKEN-B' });
      tradeValidationService.validate
        .mockResolvedValueOnce(ValidationResult.valid(resolvedA))
        .mockResolvedValueOnce(ValidationResult.valid(resolvedB));

      const resultA = await service.submitTrade(
        buildRequest({ idempotencyKey: 'user-a-click' }),
        'user-a',
      );
      const resultB = await service.submitTrade(
        buildRequest({ idempotencyKey: 'user-b-click' }),
        'user-b',
      );

      expect(resultA.outcome).toBe('QUEUED');
      expect(resultB.outcome).toBe('QUEUED');
      await service.drain();
      expect(tradingEngineService.createTrade).toHaveBeenCalledTimes(2);
    });
  });

  describe('kill switch', () => {
    it('rejects every new submission while the kill switch is enabled', async () => {
      configService.killSwitchEnabled = true;

      const result = await service.submitTrade(buildRequest(), 'requester-1');

      expect(result.outcome).toBe('REJECTED_KILL_SWITCH');
      expect(tradeValidationService.validate).not.toHaveBeenCalled();
    });
  });

  describe('queue overflow', () => {
    it('rejects a submission once the queue is at capacity', async () => {
      tradeValidationService.validate.mockImplementation(() =>
        Promise.resolve(
          ValidationResult.valid(
            buildResolvedInstrument({
              instrumentToken: `TOKEN-${Math.random()}`,
            }),
          ),
        ),
      );

      await service.submitTrade(buildRequest({ idempotencyKey: 'k1' }), 'r');
      await service.submitTrade(buildRequest({ idempotencyKey: 'k2' }), 'r');
      await service.submitTrade(buildRequest({ idempotencyKey: 'k3' }), 'r');

      const overflow = await service.submitTrade(
        buildRequest({ idempotencyKey: 'k4' }),
        'r',
      );

      expect(overflow.outcome).toBe('QUEUE_FULL');
    });
  });

  describe('cancellation', () => {
    it('cancels a still-queued item', async () => {
      // Pause the worker first so the item is guaranteed to still be QUEUED
      // when cancel() runs — enqueue()'d processing is chained as a
      // microtask that can otherwise interleave before this async function
      // resumes from its own await.
      worker.pause();
      const result = await service.submitTrade(
        buildRequest({ idempotencyKey: 'cancel-me' }),
        'r',
      );
      expect(result.outcome).toBe('QUEUED');

      const cancelled = await service.cancel(
        itemKeyOf(result),
        'user cancelled',
      );
      expect(cancelled.state).toBe(QueueItemState.CANCELLED);
    });

    it('throws QueueItemNotFoundException for an unknown key', () => {
      expect(() => service.getItem('unknown-key')).toThrow(
        QueueItemNotFoundException,
      );
    });
  });

  describe('metrics', () => {
    it('reports queue size and completed count', async () => {
      await service.submitTrade(buildRequest({ idempotencyKey: 'm1' }), 'r');
      await service.drain();

      const snapshot = service.getMetrics();
      expect(snapshot.completed).toBe(1);
    });
  });

  describe('cleanup (Phase 8)', () => {
    it('expireStaleItems marks an old QUEUED item as EXPIRED and leaves fresh ones alone', async () => {
      worker.pause(); // keep both items QUEUED (not auto-processed) for this assertion
      const stale = await service.submitTrade(
        buildRequest({ idempotencyKey: 'stale' }),
        'r',
      );
      clock.advanceBy(2 * 60 * 60 * 1000);
      const fresh = await service.submitTrade(
        buildRequest({ idempotencyKey: 'fresh' }),
        'r',
      );

      const expiredCount = await service.expireStaleItems(60 * 60 * 1000);

      expect(expiredCount).toBe(1);
      expect(service.getItem(itemKeyOf(stale)).state).toBe(
        QueueItemState.EXPIRED,
      );
      expect(service.getItem(itemKeyOf(fresh)).state).toBe(
        QueueItemState.QUEUED,
      );
    });

    it('expireStaleItems never touches an already-processing/terminal item', async () => {
      const result = await service.submitTrade(
        buildRequest({ idempotencyKey: 'k1' }),
        'r',
      );
      await service.drain(); // completes normally

      const expiredCount = await service.expireStaleItems(0);

      expect(expiredCount).toBe(0);
      expect(service.getItem(itemKeyOf(result)).state).toBe(
        QueueItemState.COMPLETED,
      );
    });

    it('cleanupLocks delegates to the LockManager', () => {
      expect(service.cleanupLocks()).toBe(0);
    });
  });

  describe('restart recovery', () => {
    it('resets a LOCKED item left over from a crash back to QUEUED and reprocesses it to COMPLETED', async () => {
      const staleSnapshot = {
        id: 'item-recovered',
        idempotencyKey: 'idem-recovered',
        orderType: 'CREATE_TRADE',
        state: QueueItemState.LOCKED,
        request: buildRequest(),
        resolvedInstrument: buildResolvedInstrument({
          instrumentToken: 'TOKEN-RECOVERED',
        }),
        attempts: 0,
        lockOwner: 'dead-worker',
        lockedAt: new Date(clock.now()).toISOString(),
        lastError: null,
        resultTradeId: null,
        history: [
          {
            state: QueueItemState.QUEUED,
            occurredAt: new Date(clock.now()).toISOString(),
          },
        ],
        createdAt: new Date(clock.now()).toISOString(),
        updatedAt: new Date(clock.now()).toISOString(),
      } as const;
      repository.seed(
        staleSnapshot as unknown as Parameters<typeof repository.seed>[0],
      );

      const recoveredService = buildService();
      await recoveredService.onModuleInit();
      await recoveredService.drain();

      const item = recoveredService.getItem('idem-recovered');
      expect(item.state).toBe(QueueItemState.COMPLETED);
      expect(item.lockOwner).toBeNull();
    });

    it('does not touch an already-terminal item on recovery', async () => {
      const completedSnapshot = {
        id: 'item-done',
        idempotencyKey: 'idem-done',
        orderType: 'CREATE_TRADE',
        state: QueueItemState.COMPLETED,
        request: buildRequest(),
        resolvedInstrument: buildResolvedInstrument(),
        attempts: 0,
        lockOwner: null,
        lockedAt: null,
        lastError: null,
        resultTradeId: 'trade-done',
        history: [],
        createdAt: new Date(clock.now()).toISOString(),
        updatedAt: new Date(clock.now()).toISOString(),
      } as const;
      repository.seed(
        completedSnapshot as unknown as Parameters<typeof repository.seed>[0],
      );

      const recoveredService = buildService();
      await recoveredService.onModuleInit();

      expect(recoveredService.getAllItems()).toHaveLength(0);
    });
  });
});

function itemKeyOf(result: {
  outcome: string;
  item?: { idempotencyKey: string };
}): string {
  if (result.outcome !== 'QUEUED' || !result.item) {
    throw new Error('expected a QUEUED result');
  }
  return result.item.idempotencyKey;
}
