import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { TrailingSLMovedEvent } from '@modules/trading-engine/events/trailing-sl-moved.event';
import { StopLossManager } from './stop-loss-manager.service';
import { TradeExtensionStore } from './trade-extension.store';
import { FakeClock } from './testing/fake-clock';
import { FakeTradeExtensionRepository } from './testing/fake-trade-extension-repository';
import { TrailingStrategy } from './models/trailing-strategy.enum';

describe('StopLossManager', () => {
  let handlers: ((event: BaseEvent) => void)[];
  let eventBus: IEventBus;
  let extensionStore: TradeExtensionStore;
  let manager: StopLossManager;

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
    extensionStore = new TradeExtensionStore(
      new FakeTradeExtensionRepository(),
      new FakeClock(),
    );
    manager = new StopLossManager(extensionStore, eventBus, new FakeClock());
    manager.onModuleInit();
  });

  describe('configuration', () => {
    it('configureTrailing enables dynamic SL with the given strategy', async () => {
      const extension = await manager.configureTrailing('t1', {
        strategy: TrailingStrategy.FIXED_POINTS,
        fixedPoints: 5,
      });
      expect(extension.trailingEnabled).toBe(true);
      expect(extension.trailingConfig?.strategy).toBe(
        TrailingStrategy.FIXED_POINTS,
      );
    });

    it('disableTrailing reverts to static SL (engine default only)', async () => {
      await manager.configureTrailing('t1', {
        strategy: TrailingStrategy.FIXED_POINTS,
        fixedPoints: 5,
      });
      const extension = await manager.disableTrailing('t1');
      expect(extension.trailingEnabled).toBe(false);
      expect(extension.trailingConfig).toBeNull();
    });

    it('enableBreakEven configures the BREAK_EVEN strategy in one call', async () => {
      const extension = await manager.enableBreakEven('t1');
      expect(extension.trailingEnabled).toBe(true);
      expect(extension.trailingConfig?.strategy).toBe(
        TrailingStrategy.BREAK_EVEN,
      );
    });
  });

  describe('history', () => {
    it('is empty for a trade with no recorded moves', () => {
      expect(manager.getHistory('t1')).toEqual([]);
    });

    it('records every TrailingSLMovedEvent for its trade', () => {
      handlers.forEach((h) => h(new TrailingSLMovedEvent('t1', 95, 100)));
      handlers.forEach((h) => h(new TrailingSLMovedEvent('t1', 100, 110)));

      const history = manager.getHistory('t1');
      expect(history).toHaveLength(2);
      expect(history[0].newStopLoss).toBe(100);
      expect(history[1].newStopLoss).toBe(110);
    });

    it('keeps history separate per trade', () => {
      handlers.forEach((h) => h(new TrailingSLMovedEvent('t1', 95, 100)));
      handlers.forEach((h) => h(new TrailingSLMovedEvent('t2', 50, 55)));

      expect(manager.getHistory('t1')).toHaveLength(1);
      expect(manager.getHistory('t2')).toHaveLength(1);
    });
  });
});
