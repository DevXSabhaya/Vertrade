import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import type { IOrderExecutor } from '@modules/broker/executors/order-executor.interface';
import type { PaperExecutor } from '@modules/broker/executors/paper.executor';
import type { AngelOneExecutor } from '@modules/broker/executors/angel-one/angel-one.executor';
import { PositionManager } from './position-manager.service';
import { TradeExtensionStore } from './trade-extension.store';
import { PnLService } from './pnl.service';
import { FakeClock } from './testing/fake-clock';
import { FakeTradeExtensionRepository } from './testing/fake-trade-extension-repository';
import { TradeRecordNotFoundException } from './exceptions/trade-record-not-found.exception';

function fakeOrderExecutor(): IOrderExecutor {
  return {
    placeEntryOrder: jest.fn(),
    modifyOrder: jest.fn(),
    cancelOrder: jest.fn(),
    exitPosition: jest.fn(),
    getOrderStatus: jest.fn(),
  };
}

describe('PositionManager', () => {
  let eventBus: IEventBus;
  let subscribeToAllHandlers: ((event: BaseEvent) => void)[];
  let clock: FakeClock;
  let tradingEngineService: TradingEngineService;
  let extensionStore: TradeExtensionStore;
  let extensionRepository: FakeTradeExtensionRepository;
  let pnlService: PnLService;
  let manager: PositionManager;

  beforeEach(() => {
    subscribeToAllHandlers = [];
    eventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: (handler: (event: BaseEvent) => void) => {
        subscribeToAllHandlers.push(handler);
      },
    };
    clock = new FakeClock();
    tradingEngineService = new TradingEngineService(
      eventBus,
      fakeOrderExecutor() as unknown as PaperExecutor,
      fakeOrderExecutor() as unknown as AngelOneExecutor,
      clock,
    );
    extensionRepository = new FakeTradeExtensionRepository();
    extensionStore = new TradeExtensionStore(extensionRepository, clock);
    pnlService = new PnLService(eventBus, clock);
    manager = new PositionManager(
      tradingEngineService,
      extensionStore,
      pnlService,
      eventBus,
      clock,
    );
    manager.onModuleInit();
  });

  function createTrade(
    overrides: Partial<Parameters<TradingEngineService['createTrade']>[0]> = {},
  ) {
    return tradingEngineService.createTrade({
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
  }

  describe('getPosition', () => {
    it('composes a TradeRecord for a known trade', async () => {
      const snapshot = createTrade();
      const record = await manager.getPosition(snapshot.id);
      expect(record.tradeId).toBe(snapshot.id);
      expect(record.instrument).toBe('NIFTY24500CE');
    });

    it('throws TradeRecordNotFoundException for an unknown trade id', async () => {
      await expect(manager.getPosition('missing')).rejects.toThrow(
        TradeRecordNotFoundException,
      );
    });
  });

  describe('getActivePositions', () => {
    it('excludes terminal trades', async () => {
      const active = createTrade();
      const cancelled = createTrade({ instrumentToken: 'TOKEN-2' });
      await tradingEngineService.cancelTrade(cancelled.id, 'test');

      const positions = await manager.getActivePositions();

      expect(positions.map((p) => p.tradeId)).toEqual([active.id]);
    });
  });

  describe('getAllPositions', () => {
    it('includes both active and terminal trades', async () => {
      const active = createTrade();
      const cancelled = createTrade({ instrumentToken: 'TOKEN-2' });
      await tradingEngineService.cancelTrade(cancelled.id, 'test');

      const positions = await manager.getAllPositions();

      expect(positions.map((p) => p.tradeId).sort()).toEqual(
        [active.id, cancelled.id].sort(),
      );
    });
  });

  describe('caching', () => {
    it('caches a composed record and reuses it on the next read', async () => {
      const snapshot = createTrade();
      const first = await manager.getPosition(snapshot.id);
      const findSpy = jest.spyOn(extensionRepository, 'find');

      const second = await manager.getPosition(snapshot.id);

      expect(second).toEqual(first);
      expect(findSpy).not.toHaveBeenCalled();
    });

    it('invalidates the cache entry when an event names that tradeId', async () => {
      const snapshot = createTrade();
      await manager.getPosition(snapshot.id);

      subscribeToAllHandlers.forEach((h) =>
        h({
          eventName: 'x',
          tradeId: snapshot.id,
          metadata: {},
        } as unknown as BaseEvent),
      );

      const findSpy = jest.spyOn(extensionRepository, 'find');
      await manager.getPosition(snapshot.id);
      expect(findSpy).toHaveBeenCalled();
    });
  });
});
