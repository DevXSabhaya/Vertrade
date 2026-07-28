import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import type { PaperExecutor } from '@modules/broker/executors/paper.executor';
import type { AngelOneExecutor } from '@modules/broker/executors/angel-one/angel-one.executor';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { OrderResponse } from '@modules/broker/executors/models/order-response.model';
import { OrderStatus } from '@modules/broker/executors/models/order-status.enum';
import { MarketPriceUpdatedEvent } from '@shared/events/market-price-updated.event';
import { TrailingManager } from './trailing-manager.service';
import { TradeExtensionStore } from './trade-extension.store';
import { FakeClock } from './testing/fake-clock';
import { FakeTradeExtensionRepository } from './testing/fake-trade-extension-repository';
import { TrailingStrategy } from './models/trailing-strategy.enum';
import { StopLossMovedEvent } from './events';

describe('TrailingManager', () => {
  let subscribers: Record<string, ((event: BaseEvent) => void)[]>;
  let subscribeToAllHandlers: ((event: BaseEvent) => void)[];
  let publishSpy: jest.Mock;
  let eventBus: IEventBus;
  let tradingEngineService: TradingEngineService;
  let extensionStore: TradeExtensionStore;
  let extensionRepository: FakeTradeExtensionRepository;
  let manager: TrailingManager;

  beforeEach(() => {
    subscribers = {};
    subscribeToAllHandlers = [];
    publishSpy = jest.fn();
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
    const clock = new FakeClock();
    const executor = {
      placeEntryOrder: jest
        .fn()
        .mockResolvedValue(
          new OrderResponse('E-1', OrderStatus.FILLED, 50, 100, new Date()),
        ),
      modifyOrder: jest.fn(),
      cancelOrder: jest.fn(),
      exitPosition: jest.fn(),
      getOrderStatus: jest.fn(),
    };
    tradingEngineService = new TradingEngineService(
      eventBus,
      executor as unknown as PaperExecutor,
      executor as unknown as AngelOneExecutor,
      clock,
    );
    extensionRepository = new FakeTradeExtensionRepository();
    extensionStore = new TradeExtensionStore(extensionRepository, clock);
    manager = new TrailingManager(
      tradingEngineService,
      extensionStore,
      eventBus,
    );
    manager.onModuleInit();
  });

  async function activeTrade(overrides: Record<string, unknown> = {}) {
    const snapshot = tradingEngineService.createTrade({
      direction: TradeDirection.LONG,
      exchange: 'NFO',
      tradingSymbol: 'NIFTY24500CE',
      instrumentToken: 'TOKEN-1',
      quantity: 50,
      entryTriggerPrice: 100,
      initialStopLoss: 95,
      targets: [500], // far away, so the engine's own default trailing never interferes with these tests
      mode: 'PAPER',
      ...overrides,
    });
    await tradingEngineService.handleMarketPriceUpdate(
      snapshot.instrumentToken,
      100,
    );
    return snapshot;
  }

  function tick(instrumentToken: string, price: number): void {
    subscribers[MarketPriceUpdatedEvent.EVENT_NAME].forEach((h) =>
      h(new MarketPriceUpdatedEvent(instrumentToken, price)),
    );
  }

  /** TrailingManager's tick handler is fire-and-forget (async, never awaited by the publisher) and chains several awaits internally — flush enough microtasks for it to fully settle before asserting. */
  async function flush(): Promise<void> {
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
  }

  it('does nothing for a trade with trailing not enabled (the default)', async () => {
    const snapshot = await activeTrade();
    tick(snapshot.instrumentToken, 120);
    await flush();

    expect(tradingEngineService.getTrade(snapshot.id).currentStopLoss).toBe(95);
  });

  it('moves the stop loss per the configured FIXED_POINTS strategy on the next tick', async () => {
    const snapshot = await activeTrade();
    await extensionStore.patch(snapshot.id, {
      trailingEnabled: true,
      trailingConfig: {
        strategy: TrailingStrategy.FIXED_POINTS,
        fixedPoints: 5,
      },
    });

    tick(snapshot.instrumentToken, 120);
    await flush();

    expect(tradingEngineService.getTrade(snapshot.id).currentStopLoss).toBe(
      115,
    );
  });

  it('publishes StopLossMovedEvent with the configured strategy when it moves the stop loss', async () => {
    const snapshot = await activeTrade();
    await extensionStore.patch(snapshot.id, {
      trailingEnabled: true,
      trailingConfig: {
        strategy: TrailingStrategy.FIXED_POINTS,
        fixedPoints: 5,
      },
    });

    tick(snapshot.instrumentToken, 120);
    await flush();

    const events = publishSpy.mock.calls.map(([e]: [unknown]) => e);
    const moved = events.find((e) => e instanceof StopLossMovedEvent);
    expect(moved?.newStopLoss).toBe(115);
    expect(moved?.strategy).toBe(TrailingStrategy.FIXED_POINTS);
  });

  it('does not publish StopLossMovedEvent when the proposal does not improve on the current stop loss', async () => {
    const snapshot = await activeTrade();
    await extensionStore.patch(snapshot.id, {
      trailingEnabled: true,
      trailingConfig: {
        strategy: TrailingStrategy.FIXED_POINTS,
        fixedPoints: 50,
      },
    });

    // Proposed: 120 - 50 = 70, below the current stop loss of 95 — rejected.
    tick(snapshot.instrumentToken, 120);
    await flush();

    expect(tradingEngineService.getTrade(snapshot.id).currentStopLoss).toBe(95);
    const events = publishSpy.mock.calls.map(([e]: [unknown]) => e);
    expect(events.some((e) => e instanceof StopLossMovedEvent)).toBe(false);
  });

  it('persists the STEP strategy boundary onto the extension for the next tick', async () => {
    const snapshot = await activeTrade();
    await extensionStore.patch(snapshot.id, {
      trailingEnabled: true,
      trailingConfig: { strategy: TrailingStrategy.STEP, stepSize: 10 },
    });

    tick(snapshot.instrumentToken, 111);
    await flush();

    const extension = await extensionRepository.find(snapshot.id);
    expect(extension?.lastTrailingStepPrice).toBe(110);
  });

  it('caches the extension and does not re-read it from the repository on every tick', async () => {
    const snapshot = await activeTrade();
    await extensionStore.patch(snapshot.id, {
      trailingEnabled: true,
      trailingConfig: {
        strategy: TrailingStrategy.FIXED_POINTS,
        fixedPoints: 1,
      },
    });
    tick(snapshot.instrumentToken, 105);
    await flush();

    const findSpy = jest.spyOn(extensionRepository, 'find');
    tick(snapshot.instrumentToken, 106);
    await flush();

    expect(findSpy).not.toHaveBeenCalled();
  });

  it('invalidates the cache when an event names the trade', async () => {
    const snapshot = await activeTrade();
    await extensionStore.patch(snapshot.id, {
      trailingEnabled: true,
      trailingConfig: {
        strategy: TrailingStrategy.FIXED_POINTS,
        fixedPoints: 1,
      },
    });
    tick(snapshot.instrumentToken, 105); // warms the cache
    await flush();

    subscribeToAllHandlers.forEach((h) =>
      h({
        eventName: 'x',
        tradeId: snapshot.id,
        metadata: {},
      } as unknown as BaseEvent),
    );

    const findSpy = jest.spyOn(extensionRepository, 'find');
    tick(snapshot.instrumentToken, 106);
    await flush();
    expect(findSpy).toHaveBeenCalled();
  });

  it('ignores trades on a different instrument', async () => {
    const snapshot = await activeTrade({ instrumentToken: 'TOKEN-A' });
    await extensionStore.patch(snapshot.id, {
      trailingEnabled: true,
      trailingConfig: {
        strategy: TrailingStrategy.FIXED_POINTS,
        fixedPoints: 5,
      },
    });

    tick('TOKEN-B', 200);
    await flush();

    expect(tradingEngineService.getTrade(snapshot.id).currentStopLoss).toBe(95);
  });
});
