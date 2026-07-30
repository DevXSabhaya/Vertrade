import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { PaperExecutor } from '@modules/broker/executors/paper.executor';
import type { DhanExecutor } from '@modules/broker/executors/dhan/dhan.executor';
import { LocalPositionProvider } from './local-position.provider';

class FixedClock {
  now(): Date {
    return new Date(1_700_000_000_000);
  }
}

describe('LocalPositionProvider', () => {
  let eventBus: IEventBus;
  let tradingEngineService: TradingEngineService;
  let provider: LocalPositionProvider;

  beforeEach(() => {
    eventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    const executor = {
      placeEntryOrder: jest.fn(),
      modifyOrder: jest.fn(),
      cancelOrder: jest.fn(),
      exitPosition: jest.fn(),
      getOrderStatus: jest.fn(),
    };
    tradingEngineService = new TradingEngineService(
      eventBus,
      executor as unknown as PaperExecutor,
      executor as unknown as DhanExecutor,
      new FixedClock(),
    );
    provider = new LocalPositionProvider(tradingEngineService);
  });

  it('returns every non-terminal trade', () => {
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

    const positions = provider.getOpenPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0].tradeState).toBe(TradeState.WAITING_ENTRY);
  });

  it('excludes terminal trades', async () => {
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
    await tradingEngineService.cancelTrade(snapshot.id, 'test');

    expect(provider.getOpenPositions()).toHaveLength(0);
  });
});
