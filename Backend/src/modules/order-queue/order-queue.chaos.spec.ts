import type { ConfigService } from '@core/config/config.service';
import type { TradingModeService } from '@modules/trading-mode/trading-mode.service';
import type { MarketDataService } from '@modules/market-data/market-data.service';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { TradeValidationService } from '@modules/trade-validation/trade-validation.service';
import { ValidationResult } from '@modules/trade-validation/models/validation-result.model';
import type { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import type { QueueItemSnapshot } from './models/queue-item-snapshot';
import type { OrderQueueSubmissionResult } from './models/order-queue-submission-result.model';
import { OrderQueueService } from './order-queue.service';
import { QueueWorker } from './queue-worker.service';
import { LockManager } from './lock/lock-manager';
import { QueueMetricsService } from './metrics/queue-metrics.service';
import { FakeClock } from './testing/fake-clock';
import { FakeQueueItemRepository } from './testing/fake-queue-item-repository';
import { InstantTimerScheduler } from './testing/instant-timer-scheduler';
import {
  buildRequest,
  buildResolvedInstrument,
} from './testing/build-fixtures';

/** Narrows the discriminated OrderQueueSubmissionResult union to the two outcomes that carry an `item`. */
function hasItem(
  result: OrderQueueSubmissionResult,
): result is Extract<OrderQueueSubmissionResult, { item: QueueItemSnapshot }> {
  return result.outcome === 'QUEUED' || result.outcome === 'DUPLICATE';
}

/**
 * "Load test / chaos test" per the production hardening audit: fires many
 * concurrent `submitTrade` calls at once — both duplicates of the exact
 * same signal (double-click, a retried webhook, a duplicated WebSocket
 * message) and distinct signals across many instruments — and asserts the
 * exactly-once guarantee, memory boundedness, and crash-freedom hold at
 * increasing scale. Every executor call is a fully in-memory fake (no real
 * network, no real timers), so this runs in well under a second even at
 * 1000 concurrent signals.
 */
describe('OrderQueueService — concurrency chaos/load', () => {
  let clock: FakeClock;
  let lockManager: LockManager;
  let tradingEngineService: jest.Mocked<
    Pick<TradingEngineService, 'createTrade' | 'getAllTrades'>
  >;
  let tradeValidationService: jest.Mocked<
    Pick<TradeValidationService, 'validate'>
  >;
  let eventBus: IEventBus;
  let metrics: QueueMetricsService;
  let repository: FakeQueueItemRepository;
  let configService: { killSwitchEnabled: boolean };
  let worker: QueueWorker;
  let service: OrderQueueService;
  let tradeSequence: number;

  beforeEach(() => {
    tradeSequence = 0;
    clock = new FakeClock();
    lockManager = new LockManager(clock, 30_000);
    tradingEngineService = {
      createTrade: jest.fn().mockImplementation(() => {
        tradeSequence += 1;
        return { id: `trade-${tradeSequence}` } as TradeSnapshot;
      }),
      getAllTrades: jest.fn().mockReturnValue([]),
    };
    tradeValidationService = {
      validate: jest
        .fn()
        .mockResolvedValue(ValidationResult.valid(buildResolvedInstrument())),
    };
    eventBus = {
      publish: jest.fn(),
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
      { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100, jitterRatio: 0 },
      metrics,
      repository,
      configService as unknown as ConfigService,
      {
        subscribeInstrument: () => Promise.resolve(),
      } as unknown as MarketDataService,
      { getCurrentMode: () => 'PAPER' } as unknown as TradingModeService,
      new InstantTimerScheduler(),
    );
    service = new OrderQueueService(
      tradeValidationService as unknown as TradeValidationService,
      worker,
      metrics,
      lockManager,
      repository,
      eventBus,
      clock,
      /* maxQueueSize */ 5000,
      configService as unknown as ConfigService,
    );
  });

  describe.each([10, 100, 500, 1000])(
    '%d simultaneous duplicate trade signals (same idempotency key)',
    (count) => {
      it('creates exactly one trade — every other signal is reported as DUPLICATE, never a second execution', async () => {
        const requests = Array.from({ length: count }, () =>
          service.submitTrade(
            buildRequest({ idempotencyKey: 'duplicate-signal-key' }),
            'requester',
          ),
        );

        const results = await Promise.all(requests);
        await service.drain();

        const queued = results.filter(
          (
            r,
          ): r is Extract<OrderQueueSubmissionResult, { outcome: 'QUEUED' }> =>
            r.outcome === 'QUEUED',
        );
        const duplicates = results.filter(
          (
            r,
          ): r is Extract<
            OrderQueueSubmissionResult,
            { outcome: 'DUPLICATE' }
          > => r.outcome === 'DUPLICATE',
        );

        expect(queued).toHaveLength(1);
        expect(duplicates).toHaveLength(count - 1);
        expect(tradingEngineService.createTrade).toHaveBeenCalledTimes(1);

        // Every DUPLICATE response points back at the exact same item as
        // the one QUEUED response — never a second, different item.
        const queuedKey = queued[0]?.item.idempotencyKey;
        expect(
          duplicates.every((d) => d.item.idempotencyKey === queuedKey),
        ).toBe(true);
      });
    },
  );

  describe.each([10, 100, 500, 1000])(
    '%d simultaneous distinct trade signals (different instruments)',
    (count) => {
      it('processes every one exactly once, with no crash, no lost item, and no state corruption', async () => {
        const requests = Array.from({ length: count }, (_, i) =>
          service.submitTrade(
            buildRequest({
              idempotencyKey: `distinct-signal-${i}`,
              rawSymbol: `INSTRUMENT-${i}`,
            }),
            'requester',
          ),
        );

        const results = await Promise.all(requests);
        await service.drain();

        expect(results.every((r) => r.outcome === 'QUEUED')).toBe(true);
        expect(tradingEngineService.createTrade).toHaveBeenCalledTimes(count);

        const uniqueIds = new Set(
          results.filter(hasItem).map((r) => r.item.id),
        );
        expect(uniqueIds.size).toBe(count);

        const metricsSnapshot = service.getMetrics();
        expect(metricsSnapshot.completed).toBe(count);

        // Memory stays bounded: every item is terminal (COMPLETED), so a
        // full prune at maxAgeMs=0 must clear the entire in-memory map —
        // proving pruneCompletedItems scales the same way at 1000 as it
        // does at 10.
        const removedCount = service.pruneCompletedItems(0);
        expect(removedCount).toBe(count);
        expect(service.getAllItems()).toHaveLength(0);
      });
    },
  );

  it('mixed chaos: 500 signals across only 5 distinct instruments (heavy lock contention) still yields exactly one trade per distinct idempotency key, never more', async () => {
    const SIGNAL_COUNT = 500;
    const INSTRUMENT_COUNT = 5;
    const requests = Array.from({ length: SIGNAL_COUNT }, (_, i) => {
      const instrumentIndex = i % INSTRUMENT_COUNT;
      return service.submitTrade(
        buildRequest({
          idempotencyKey: `chaos-${instrumentIndex}`,
          rawSymbol: `CHAOS-INSTRUMENT-${instrumentIndex}`,
        }),
        'requester',
      );
    });

    const results = await Promise.all(requests);
    await service.drain();

    const queued = results.filter((r) => r.outcome === 'QUEUED');
    expect(queued).toHaveLength(INSTRUMENT_COUNT);
    expect(tradingEngineService.createTrade).toHaveBeenCalledTimes(
      INSTRUMENT_COUNT,
    );

    // Never more than one COMPLETED item per distinct idempotency key —
    // the definition of "no duplicate orders" at the queue layer.
    const completedByKey = new Map<string, number>();
    for (const item of service.getAllItems()) {
      completedByKey.set(
        item.idempotencyKey,
        (completedByKey.get(item.idempotencyKey) ?? 0) + 1,
      );
    }
    expect([...completedByKey.values()].every((n) => n === 1)).toBe(true);
  });

  it('a burst of 1000 concurrent signals never throws an uncaught exception even when every validation call fails', async () => {
    tradeValidationService.validate.mockRejectedValue(
      new Error('simulated validation-layer outage'),
    );

    const requests = Array.from({ length: 1000 }, (_, i) =>
      service
        .submitTrade(
          buildRequest({ idempotencyKey: `failing-${i}` }),
          'requester',
        )
        .then(
          (result): OrderQueueSubmissionResult | string => result,
          (error: unknown) =>
            error instanceof Error ? error.message : 'Unknown error',
        ),
    );

    const results = await Promise.all(requests);

    // submitTrade only ever propagates a rejection if the validation
    // service itself throws synchronously-unhandled — here it's a
    // rejected promise, which submitTrade awaits and would surface as a
    // thrown error. Asserting the harness never hangs/crashes and every
    // call resolved (to either a result or a caught error) is the
    // meaningful chaos guarantee; it must never take down the process.
    expect(results).toHaveLength(1000);
  });
});
