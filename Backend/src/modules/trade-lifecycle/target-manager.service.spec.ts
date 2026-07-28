import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import type { PaperExecutor } from '@modules/broker/executors/paper.executor';
import type { AngelOneExecutor } from '@modules/broker/executors/angel-one/angel-one.executor';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TargetHitEvent } from '@modules/trading-engine/events/target-hit.event';
import { TargetManager } from './target-manager.service';
import type { ExitManager } from './exit-manager.service';
import { TradeExtensionStore } from './trade-extension.store';
import { FakeClock } from './testing/fake-clock';
import { FakeTradeExtensionRepository } from './testing/fake-trade-extension-repository';
import { ExitReason } from './models/exit-reason.enum';

describe('TargetManager', () => {
  let handlers: ((event: BaseEvent) => void)[];
  let eventBus: IEventBus;
  let tradingEngineService: TradingEngineService;
  let extensionStore: TradeExtensionStore;
  let exitManager: jest.Mocked<Pick<ExitManager, 'requestPartialExit'>>;
  let manager: TargetManager;

  beforeEach(() => {
    handlers = [];
    eventBus = {
      publish: jest.fn(),
      subscribe: <T extends BaseEvent = BaseEvent>(
        _name: string,
        handler: (event: T) => void,
      ) => {
        handlers.push(handler as (event: BaseEvent) => void);
      },
      subscribeToAll: jest.fn(),
    };
    const clock = new FakeClock();
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
      } as unknown as AngelOneExecutor,
      clock,
    );
    extensionStore = new TradeExtensionStore(
      new FakeTradeExtensionRepository(),
      clock,
    );
    exitManager = { requestPartialExit: jest.fn().mockResolvedValue({}) };
    manager = new TargetManager(
      tradingEngineService,
      extensionStore,
      exitManager as unknown as ExitManager,
      eventBus,
    );
    manager.onModuleInit();
  });

  function createTrade() {
    return tradingEngineService.createTrade({
      direction: TradeDirection.LONG,
      exchange: 'NFO',
      tradingSymbol: 'NIFTY24500CE',
      instrumentToken: 'TOKEN-1',
      quantity: 50,
      entryTriggerPrice: 100,
      initialStopLoss: 95,
      targets: [110, 120, 135],
      mode: 'PAPER',
    });
  }

  describe('configureTargetExitPlan', () => {
    it('persists the per-target exit quantities', async () => {
      const snapshot = createTrade();
      await manager.configureTargetExitPlan(snapshot.id, [10, 10, 30]);
      const extension = await extensionStore.get(snapshot.id);
      expect(extension.targetExitQuantities).toEqual([10, 10, 30]);
    });
  });

  describe('onTargetHit (via TargetHitEvent)', () => {
    it('triggers a partial exit when a plan is configured for that target index', async () => {
      const snapshot = createTrade();
      await manager.configureTargetExitPlan(snapshot.id, [10, 10, 30]);

      handlers.forEach((h) => h(new TargetHitEvent(snapshot.id, 110, 0, 2)));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(exitManager.requestPartialExit).toHaveBeenCalledWith(
        snapshot.id,
        10,
        ExitReason.TARGET,
      );
    });

    it('does nothing when no exit plan is configured (trail-only default)', async () => {
      const snapshot = createTrade();

      handlers.forEach((h) => h(new TargetHitEvent(snapshot.id, 110, 0, 2)));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(exitManager.requestPartialExit).not.toHaveBeenCalled();
    });

    it('does nothing when the configured quantity for that target is zero', async () => {
      const snapshot = createTrade();
      await manager.configureTargetExitPlan(snapshot.id, [0, 10, 30]);

      handlers.forEach((h) => h(new TargetHitEvent(snapshot.id, 110, 0, 2)));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(exitManager.requestPartialExit).not.toHaveBeenCalled();
    });

    it('never throws when the partial exit itself fails', async () => {
      const snapshot = createTrade();
      await manager.configureTargetExitPlan(snapshot.id, [10]);
      exitManager.requestPartialExit.mockRejectedValue(new Error('boom'));

      expect(() =>
        handlers.forEach((h) => h(new TargetHitEvent(snapshot.id, 110, 0, 2))),
      ).not.toThrow();
    });
  });

  describe('getTargetProgress', () => {
    it('reports zero targets hit and the first target as next for a fresh trade', () => {
      const snapshot = createTrade();
      const progress = manager.getTargetProgress(snapshot.id);
      expect(progress).toEqual({
        tradeId: snapshot.id,
        targetsHit: 0,
        totalTargets: 3,
        nextTarget: 110,
      });
    });
  });
});
