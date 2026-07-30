import { EventEmitter2 } from '@nestjs/event-emitter';
import type { MarketDataService } from '@modules/market-data/market-data.service';
import { EventEmitterEventBus } from '@core/event-bus/event-emitter-event-bus';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import type { IOrderExecutor } from '@modules/broker/executors/order-executor.interface';
import type { PaperExecutor } from '@modules/broker/executors/paper.executor';
import type { DhanExecutor } from '@modules/broker/executors/dhan/dhan.executor';
import { OrderResponse } from '@modules/broker/executors/models/order-response.model';
import { OrderStatus } from '@modules/broker/executors/models/order-status.enum';
import { EntryFilledEvent } from '@modules/trading-engine/events/entry-filled.event';
import { TradeCancelledEvent } from '@modules/trading-engine/events/trade-cancelled.event';
import { TradeLifecycleService } from './trade-lifecycle.service';
import { TradeExtensionStore } from './trade-extension.store';
import { PnLService } from './pnl.service';
import { FakeClock } from './testing/fake-clock';
import { FakeTradeExtensionRepository } from './testing/fake-trade-extension-repository';
import { FakeTradeHistoryRepository } from './testing/fake-trade-history-repository';
import { PositionOpenedEvent } from './events';

/**
 * Uses the real `EventEmitterEventBus` (same pattern as
 * `trading-engine.service.spec.ts`'s own "wiring" test) rather than a hand
 * rolled fake — these tests specifically exercise the automatic chain from
 * `TradingEngineService` publishing its own lifecycle events through to
 * `TradeLifecycleService`'s subscriptions, which a fake `publish()` that
 * only records calls (and never dispatches) cannot exercise.
 */
function buildHarness() {
  const eventBus: IEventBus = new EventEmitterEventBus(new EventEmitter2());
  const clock = new FakeClock();
  const executor: IOrderExecutor = {
    placeEntryOrder: jest
      .fn()
      .mockResolvedValue(
        new OrderResponse('E-1', OrderStatus.FILLED, 50, 100, new Date()),
      ),
    modifyOrder: jest.fn(),
    cancelOrder: jest.fn(),
    exitPosition: jest
      .fn()
      .mockResolvedValue(
        new OrderResponse('X-1', OrderStatus.FILLED, 50, 110, new Date()),
      ),
    getOrderStatus: jest.fn(),
  };
  const tradingEngineService = new TradingEngineService(
    eventBus,
    executor as unknown as PaperExecutor,
    executor as unknown as DhanExecutor,
    clock,
  );
  const extensionStore = new TradeExtensionStore(
    new FakeTradeExtensionRepository(),
    clock,
  );
  const pnlService = new PnLService(eventBus, clock);
  const historyRepository = new FakeTradeHistoryRepository();
  const service = new TradeLifecycleService(
    tradingEngineService,
    extensionStore,
    pnlService,
    eventBus,
    clock,
    historyRepository,
    {
      unsubscribeInstrument: () => Promise.resolve(),
    } as unknown as MarketDataService,
  );
  service.onModuleInit();

  return {
    eventBus,
    tradingEngineService,
    historyRepository,
    service,
    executor,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

describe('TradeLifecycleService', () => {
  it('publishes PositionOpenedEvent when a real EntryFilledEvent is dispatched', async () => {
    const { eventBus } = buildHarness();
    const received: PositionOpenedEvent[] = [];
    eventBus.subscribe<PositionOpenedEvent>(
      PositionOpenedEvent.EVENT_NAME,
      (e) => {
        received.push(e);
      },
    );

    eventBus.publish(new EntryFilledEvent('t1', 'E-1', 101, 50));
    await flush();

    expect(received).toHaveLength(1);
    expect(received[0].tradeId).toBe('t1');
    expect(received[0].entryPrice).toBe(101);
    expect(received[0].quantity).toBe(50);
  });

  it('archives a composed TradeRecord when a trade reaches CANCELLED', async () => {
    const { tradingEngineService, historyRepository, eventBus } =
      buildHarness();
    const snapshot = tradingEngineService.createTrade({
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

    eventBus.publish(new TradeCancelledEvent(snapshot.id, 'user requested'));
    await flush();

    const archived = await historyRepository.findById(snapshot.id);
    expect(archived?.tradeId).toBe(snapshot.id);
  });

  it('does nothing when the terminal event names a trade the engine no longer holds', async () => {
    const { historyRepository, eventBus } = buildHarness();

    eventBus.publish(new TradeCancelledEvent('unknown-trade', 'x'));
    await flush();

    expect(await historyRepository.findById('unknown-trade')).toBeNull();
  });

  it('archives a trade that reaches COMPLETED with the correct realizedPnl', async () => {
    const { tradingEngineService, historyRepository } = buildHarness();
    const snapshot = tradingEngineService.createTrade({
      direction: TradeDirection.LONG,
      exchange: 'NFO',
      tradingSymbol: 'NIFTY24500CE',
      instrumentToken: 'TOKEN-2',
      quantity: 50,
      entryTriggerPrice: 100,
      initialStopLoss: 95,
      targets: [110],
      mode: 'PAPER',
    });
    await tradingEngineService.handleMarketPriceUpdate(
      snapshot.instrumentToken,
      100,
    );
    await tradingEngineService.requestFullExit(snapshot.id, 110);
    await flush();

    const archived = await historyRepository.findById(snapshot.id);
    expect(archived?.status).toBe('COMPLETED');
    expect(archived?.realizedPnl).toBe(500);
  });
});
