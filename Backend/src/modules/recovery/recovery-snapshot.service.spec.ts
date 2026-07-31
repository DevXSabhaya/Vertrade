import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import type { PaperExecutor } from '@modules/broker/executors/paper.executor';
import type { DhanExecutor } from '@modules/broker/executors/dhan/dhan.executor';
import type { OrderQueueService } from '@modules/order-queue/order-queue.service';
import type { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { MarketPriceUpdatedEvent } from '@shared/events/market-price-updated.event';
import { RecoverySnapshotService } from './recovery-snapshot.service';
import { RecoveryEventPublisher } from './recovery-event-publisher';
import { FakeClock } from './testing/fake-clock';
import { FakeTimerScheduler } from './testing/fake-timer-scheduler';
import { FakeRecoverySnapshotRepository } from './testing/fake-recovery-snapshot-repository';
import { DEFAULT_RECOVERY_CONFIG } from './models/recovery-config.model';
import { RecoverySnapshotSavedEvent } from './events';

class TestEvent extends DomainEvent {
  readonly eventName = 'test.event';
}

describe('RecoverySnapshotService', () => {
  let clock: FakeClock;
  let scheduler: FakeTimerScheduler;
  let eventBus: IEventBus;
  let publishSpy: jest.Mock;
  let subscribers: Record<string, ((event: BaseEvent) => void)[]>;
  let subscribeToAllHandlers: ((event: BaseEvent) => void)[];
  let repository: FakeRecoverySnapshotRepository;
  let tradingEngineService: TradingEngineService;
  let orderQueueService: jest.Mocked<Pick<OrderQueueService, 'getAllItems'>>;
  let brokerSessionManager: jest.Mocked<
    Pick<BrokerSessionManager, 'getActiveSession'>
  >;
  let service: RecoverySnapshotService;

  beforeEach(() => {
    clock = new FakeClock();
    scheduler = new FakeTimerScheduler();
    publishSpy = jest.fn();
    subscribers = {};
    subscribeToAllHandlers = [];
    eventBus = {
      publish: publishSpy,
      subscribe: <T extends BaseEvent = BaseEvent>(
        name: string,
        handler: (event: T) => void,
      ) => {
        subscribers[name] = subscribers[name] ?? [];
        subscribers[name].push(handler as (event: BaseEvent) => void);
      },
      subscribeToAll: (handler: (event: BaseEvent) => void) => {
        subscribeToAllHandlers.push(handler);
      },
    };
    repository = new FakeRecoverySnapshotRepository();
    tradingEngineService = new TradingEngineService(
      eventBus,
      {
        placeEntryOrder: jest.fn(),
        modifyOrder: jest.fn(),
        cancelOrder: jest.fn(),
        exitPosition: jest.fn(),
        getOrderStatus: jest.fn(),
      } as unknown as PaperExecutor,
      {
        placeEntryOrder: jest.fn(),
        modifyOrder: jest.fn(),
        cancelOrder: jest.fn(),
        exitPosition: jest.fn(),
        getOrderStatus: jest.fn(),
      } as unknown as DhanExecutor,
      clock,
    );
    orderQueueService = { getAllItems: jest.fn().mockReturnValue([]) };
    brokerSessionManager = {
      getActiveSession: jest.fn().mockReturnValue(null),
    };

    service = new RecoverySnapshotService(
      tradingEngineService,
      orderQueueService as unknown as OrderQueueService,
      brokerSessionManager as unknown as BrokerSessionManager,
      eventBus,
      clock,
      scheduler,
      DEFAULT_RECOVERY_CONFIG,
      repository,
      new RecoveryEventPublisher(eventBus),
    );
    service.onModuleInit();
  });

  describe('captureSnapshot', () => {
    it('captures every active trade, queue item, and derives idempotency keys and market subscriptions', () => {
      tradingEngineService.createTrade({
        direction: TradeDirection.LONG,
        exchange: 'NFO',
        tradingSymbol: 'NIFTY24500CE',
        instrumentToken: 'TOKEN-1',
        quantity: 50,
        entryTriggerPrice: 100,
        initialStopLoss: 95,
        targets: [110],
        mode: 'PAPER',
      });
      orderQueueService.getAllItems.mockReturnValue([
        { idempotencyKey: 'key-1' } as never,
      ]);

      const snapshot = service.captureSnapshot();

      expect(snapshot.trades).toHaveLength(1);
      expect(snapshot.idempotencyKeys).toEqual(['key-1']);
      expect(snapshot.marketSubscriptions).toEqual([
        {
          exchange: 'NFO',
          tradingSymbol: 'NIFTY24500CE',
          instrumentToken: 'TOKEN-1',
        },
      ]);
      expect(snapshot.engineStateSummary.WAITING_ENTRY).toBe(1);
    });

    it('includes the broker session client code when a session is active', () => {
      brokerSessionManager.getActiveSession.mockReturnValue({
        clientCode: 'ABC123',
      } as never);

      const snapshot = service.captureSnapshot();

      expect(snapshot.brokerSessionClientCode).toBe('ABC123');
    });

    it('tracks the last observed tick via MarketPriceUpdatedEvent', () => {
      // TradingEngineService also subscribes to this event name in its own
      // constructor — this test only cares that RecoverySnapshotService's
      // own handler (the last one registered, since it's constructed after)
      // correctly tracks the tick.
      const handlers = subscribers[MarketPriceUpdatedEvent.EVENT_NAME];
      expect(handlers.length).toBeGreaterThanOrEqual(1);
      handlers[handlers.length - 1](
        new MarketPriceUpdatedEvent('TOKEN-9', 123.45),
      );

      const snapshot = service.captureSnapshot();
      expect(snapshot.lastTick).toEqual(
        expect.objectContaining({ instrumentToken: 'TOKEN-9', price: 123.45 }),
      );
    });
  });

  describe('persistSnapshot / captureAndPersist', () => {
    it('persists and publishes RecoverySnapshotSavedEvent', async () => {
      const snapshot = service.captureSnapshot();
      await service.persistSnapshot(snapshot);

      const events = publishSpy.mock.calls.map(([e]: [unknown]) => e);
      expect(events.some((e) => e instanceof RecoverySnapshotSavedEvent)).toBe(
        true,
      );
      expect(await service.loadLatestSnapshot()).toEqual(snapshot);
    });
  });

  describe('automatic snapshot updates', () => {
    it('debounces a burst of domain events into a single capture', async () => {
      subscribeToAllHandlers.forEach((h) => h(new TestEvent()));
      subscribeToAllHandlers.forEach((h) => h(new TestEvent()));
      subscribeToAllHandlers.forEach((h) => h(new TestEvent()));

      expect(scheduler.pendingIntervalCount()).toBe(0); // uses setTimeout, not setInterval

      await scheduler.fireAllTimeoutsUntilDrained();

      expect(await service.loadLatestSnapshot()).not.toBeNull();
    });

    it('never re-triggers a capture from its own recovery.* events (no feedback loop)', async () => {
      subscribeToAllHandlers.forEach((h) =>
        h(new RecoverySnapshotSavedEvent('s1', 0, 0)),
      );

      await scheduler.fireAllTimeoutsUntilDrained();

      expect(await service.loadLatestSnapshot()).toBeNull();
    });

    it('cancels a pending debounced capture on destroy', () => {
      subscribeToAllHandlers.forEach((h) => h(new TestEvent()));
      expect(scheduler.pendingTimeoutCount()).toBe(1);

      service.onModuleDestroy();

      expect(scheduler.pendingTimeoutCount()).toBe(0);
    });

    it('never schedules a new capture from an event published after destroy — regression: a stray event during shutdown must not fire a Mongo write after the connection has closed', async () => {
      service.onModuleDestroy();

      subscribeToAllHandlers.forEach((h) => h(new TestEvent()));

      expect(scheduler.pendingTimeoutCount()).toBe(0);
      await scheduler.fireAllTimeoutsUntilDrained();
      expect(await service.loadLatestSnapshot()).toBeNull();
    });
  });
});
