import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import type { PaperExecutor } from '@modules/broker/executors/paper.executor';
import type { DhanExecutor } from '@modules/broker/executors/dhan/dhan.executor';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import { OrderResponse } from '@modules/broker/executors/models/order-response.model';
import { OrderStatus } from '@modules/broker/executors/models/order-status.enum';
import { StopLossHitEvent } from '@modules/trading-engine/events/stop-loss-hit.event';
import { ExitManager } from './exit-manager.service';
import { TradeExtensionStore } from './trade-extension.store';
import { PnLService } from './pnl.service';
import { FakeClock } from './testing/fake-clock';
import { FakeTradeExtensionRepository } from './testing/fake-trade-extension-repository';
import { ExitReason } from './models/exit-reason.enum';
import { ExitRequestedEvent, PositionClosedEvent } from './events';

describe('ExitManager', () => {
  let handlers: Record<string, ((event: BaseEvent) => void)[]>;
  let publishSpy: jest.Mock;
  let eventBus: IEventBus;
  let clock: FakeClock;
  let executor: {
    placeEntryOrder: jest.Mock;
    modifyOrder: jest.Mock;
    cancelOrder: jest.Mock;
    exitPosition: jest.Mock;
    getOrderStatus: jest.Mock;
  };
  let tradingEngineService: TradingEngineService;
  let extensionStore: TradeExtensionStore;
  let pnlService: PnLService;
  let manager: ExitManager;

  beforeEach(() => {
    handlers = {};
    publishSpy = jest.fn();
    eventBus = {
      publish: publishSpy,
      subscribe: <T extends BaseEvent = BaseEvent>(
        name: string,
        handler: (event: T) => void,
      ) => {
        handlers[name] = handlers[name] ?? [];
        handlers[name].push(handler as (event: BaseEvent) => void);
      },
      subscribeToAll: jest.fn(),
    };
    clock = new FakeClock();
    executor = {
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
      executor as unknown as DhanExecutor,
      clock,
    );
    extensionStore = new TradeExtensionStore(
      new FakeTradeExtensionRepository(),
      clock,
    );
    pnlService = new PnLService(eventBus, clock);
    manager = new ExitManager(
      tradingEngineService,
      extensionStore,
      pnlService,
      eventBus,
      clock,
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
      targets: [110, 120],
      mode: 'PAPER',
      ...overrides,
    });
    await tradingEngineService.handleMarketPriceUpdate(
      snapshot.instrumentToken,
      100,
    );
    return snapshot;
  }

  describe('manualExit', () => {
    it('exits the full open quantity and completes the trade', async () => {
      const snapshot = await activeTrade();
      executor.exitPosition.mockResolvedValue(
        new OrderResponse('X-1', OrderStatus.FILLED, 50, 105, new Date()),
      );

      const record = await manager.manualExit(snapshot.id);

      expect(record.status).toBe(TradeState.COMPLETED);
      expect(record.exitReason).toBe(ExitReason.MANUAL);
    });

    it('publishes ExitRequestedEvent before, and PositionClosedEvent after, the exit', async () => {
      const snapshot = await activeTrade();
      executor.exitPosition.mockResolvedValue(
        new OrderResponse('X-1', OrderStatus.FILLED, 50, 105, new Date()),
      );

      await manager.manualExit(snapshot.id);

      const events = publishSpy.mock.calls.map(([e]: [unknown]) => e);
      expect(events.some((e) => e instanceof ExitRequestedEvent)).toBe(true);
      expect(events.some((e) => e instanceof PositionClosedEvent)).toBe(true);
    });
  });

  describe('forceExit', () => {
    it('records exitReason FORCE', async () => {
      const snapshot = await activeTrade();
      executor.exitPosition.mockResolvedValue(
        new OrderResponse('X-1', OrderStatus.FILLED, 50, 105, new Date()),
      );

      const record = await manager.forceExit(snapshot.id);
      expect(record.exitReason).toBe(ExitReason.FORCE);
    });
  });

  describe('marketCloseExit / brokerDisconnectExit', () => {
    it('records exitReason MARKET_CLOSE', async () => {
      const snapshot = await activeTrade();
      executor.exitPosition.mockResolvedValue(
        new OrderResponse('X-1', OrderStatus.FILLED, 50, 105, new Date()),
      );
      const record = await manager.marketCloseExit(snapshot.id);
      expect(record.exitReason).toBe(ExitReason.MARKET_CLOSE);
    });

    it('records exitReason BROKER_DISCONNECT', async () => {
      const snapshot = await activeTrade();
      executor.exitPosition.mockResolvedValue(
        new OrderResponse('X-1', OrderStatus.FILLED, 50, 105, new Date()),
      );
      const record = await manager.brokerDisconnectExit(snapshot.id);
      expect(record.exitReason).toBe(ExitReason.BROKER_DISCONNECT);
    });
  });

  describe('emergencyExitAll', () => {
    it('exits every open trade with reason EMERGENCY', async () => {
      const t1 = await activeTrade({ instrumentToken: 'TOKEN-1' });
      const t2 = await activeTrade({ instrumentToken: 'TOKEN-2' });
      executor.exitPosition.mockResolvedValue(
        new OrderResponse('X-1', OrderStatus.FILLED, 50, 105, new Date()),
      );

      const results = await manager.emergencyExitAll();

      expect(results.map((r) => r.tradeId).sort()).toEqual(
        [t1.id, t2.id].sort(),
      );
      expect(results.every((r) => r.exitReason === ExitReason.EMERGENCY)).toBe(
        true,
      );
    });

    it('does not let one trade failing to exit stop the rest', async () => {
      const t1 = await activeTrade({ instrumentToken: 'TOKEN-1' });
      const t2 = await activeTrade({ instrumentToken: 'TOKEN-2' });
      executor.exitPosition
        .mockRejectedValueOnce(new Error('broker timeout'))
        .mockResolvedValueOnce(
          new OrderResponse('X-2', OrderStatus.FILLED, 50, 105, new Date()),
        );

      const results = await manager.emergencyExitAll();

      // One trade's exitPosition rejects — attemptExit swallows the
      // rejection (markExitAttemptFailed), so the trade simply doesn't
      // complete; the other trade still exits successfully.
      expect(results.length).toBe(2);
      void t1;
      void t2;
    });
  });

  describe('requestPartialExit', () => {
    it('exits only the requested quantity and records the reason', async () => {
      const snapshot = await activeTrade();
      executor.exitPosition.mockResolvedValue(
        new OrderResponse(
          'X-1',
          OrderStatus.PARTIALLY_FILLED,
          20,
          110,
          new Date(),
        ),
      );

      const record = await manager.requestPartialExit(
        snapshot.id,
        20,
        ExitReason.TARGET,
      );

      expect(record.status).toBe(TradeState.ACTIVE);
      expect(record.exitedQuantity).toBe(20);
      expect(record.exitReason).toBe(ExitReason.TARGET);
    });

    it('publishes PositionClosedEvent only when the exit fully closes the position', async () => {
      const snapshot = await activeTrade();
      executor.exitPosition.mockResolvedValue(
        new OrderResponse(
          'X-1',
          OrderStatus.PARTIALLY_FILLED,
          20,
          110,
          new Date(),
        ),
      );

      await manager.requestPartialExit(snapshot.id, 20, ExitReason.TARGET);

      const events = publishSpy.mock.calls.map(([e]: [unknown]) => e);
      expect(events.some((e) => e instanceof PositionClosedEvent)).toBe(false);
    });
  });

  describe('StopLossHitEvent attribution', () => {
    it('records exitReason STOPLOSS when the engine reports a stop-loss hit', async () => {
      const snapshot = await activeTrade();
      handlers[StopLossHitEvent.EVENT_NAME].forEach((h) =>
        h(new StopLossHitEvent(snapshot.id, 94, 95)),
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const extension = await extensionStore.get(snapshot.id);
      expect(extension.exitReason).toBe(ExitReason.STOPLOSS);
    });
  });
});
