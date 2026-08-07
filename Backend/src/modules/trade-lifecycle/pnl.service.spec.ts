import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import { MarketPriceUpdatedEvent } from '@shared/events/market-price-updated.event';
import { PnLService } from './pnl.service';
import { FakeClock } from './testing/fake-clock';

function snapshot(overrides: Partial<TradeSnapshot> = {}): TradeSnapshot {
  return {
    id: 't1',
    direction: TradeDirection.LONG,
    state: TradeState.ACTIVE,
    exchange: 'NFO',
    tradingSymbol: 'NIFTY24500CE',
    instrumentToken: 'TOKEN-1',
    quantity: 50,
    entryTriggerPrice: 100,
    initialStopLoss: 95,
    currentStopLoss: 95,
    targets: [110, 120],
    mode: 'PAPER',
    brokerAccountId: null,
    remainingTargets: [110, 120],
    entryOrderId: 'E-1',
    entryOrderLifecycle: null,
    entryFillPrice: 100,
    filledQuantity: 50,
    exitOrderId: null,
    exitOrderLifecycle: null,
    exitedQuantity: 0,
    exitProceeds: 0,
    openQuantity: 50,
    exitPrice: null,
    realizedPnl: null,
    isAwaitingExit: false,
    metadata: {},
    history: [],
    createdAt: new Date(1_700_000_000_000).toISOString(),
    updatedAt: new Date(1_700_000_000_000).toISOString(),
    ...overrides,
  };
}

describe('PnLService', () => {
  let handlers: ((event: BaseEvent) => void)[];
  let eventBus: IEventBus;
  let service: PnLService;

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
    service = new PnLService(eventBus, new FakeClock());
    service.onModuleInit();
  });

  function tick(instrumentToken: string, price: number): void {
    handlers.forEach((h) =>
      h(new MarketPriceUpdatedEvent(instrumentToken, price)),
    );
  }

  it('returns null for getMarkPrice before any tick is observed', () => {
    expect(service.getMarkPrice('TOKEN-1')).toBeNull();
  });

  it('tracks the last observed price per instrument', () => {
    tick('TOKEN-1', 105);
    tick('TOKEN-1', 110);
    expect(service.getMarkPrice('TOKEN-1')).toBe(110);
  });

  it('computes livePnl, points, and percentage from the last tick', () => {
    tick('TOKEN-1', 110);
    const result = service.compute(snapshot());

    expect(result.livePnl).toBe(500);
    expect(result.points).toBe(10);
    expect(result.percentage).toBe(10);
    expect(result.markPrice).toBe(110);
  });

  it('reports null PnL fields when no tick has been observed', () => {
    const result = service.compute(snapshot());
    expect(result.livePnl).toBeNull();
    expect(result.points).toBeNull();
    expect(result.percentage).toBeNull();
  });

  it('computes bookedPnl from exitProceeds even mid-partial-exit', () => {
    const result = service.compute(
      snapshot({ exitedQuantity: 20, exitProceeds: 2200 }),
    );
    expect(result.bookedPnl).toBe(200);
  });

  it('computes mtm as the sum of live and booked PnL', () => {
    tick('TOKEN-1', 110);
    const result = service.compute(
      snapshot({
        filledQuantity: 50,
        openQuantity: 30,
        exitedQuantity: 20,
        exitProceeds: 2200,
      }),
    );
    // live: (110-100)*30 = 300; booked: 2200-100*20=200 -> 200
    expect(result.livePnl).toBe(300);
    expect(result.bookedPnl).toBe(200);
    expect(result.mtm).toBe(500);
  });

  it('computes negative points/percentage for a SHORT trade whose price rose', () => {
    tick('TOKEN-1', 105);
    const result = service.compute(
      snapshot({ direction: TradeDirection.SHORT }),
    );
    expect(result.points).toBe(-5);
  });
});
