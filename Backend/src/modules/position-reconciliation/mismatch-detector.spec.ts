import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import { OrderStatus } from '@modules/broker/executors/models/order-status.enum';
import { MismatchDetector } from './mismatch-detector';
import { MismatchLevel } from './models/mismatch-level.enum';
import type { LocalPositionView } from './models/local-position-view.model';
import type { BrokerPositionView } from './models/broker-position-view.model';

function local(overrides: Partial<LocalPositionView> = {}): LocalPositionView {
  return {
    tradeId: 't1',
    tradingSymbol: 'NIFTY24500CE',
    exchange: 'NFO',
    instrumentToken: 'TOKEN-1',
    side: TradeDirection.LONG,
    quantity: 50,
    filledQuantity: 50,
    openQuantity: 50,
    averagePrice: 100,
    currentStopLoss: 95,
    targets: [110, 120],
    remainingTargets: [110, 120],
    tradeState: TradeState.ACTIVE,
    entryOrderId: 'E-1',
    exitOrderId: null,
    ...overrides,
  };
}

function broker(
  overrides: Partial<BrokerPositionView> = {},
): BrokerPositionView {
  return {
    tradeId: 't1',
    entryOrderStatus: OrderStatus.FILLED,
    entryFilledQuantity: 50,
    entryAveragePrice: 100,
    exitOrderStatus: null,
    exitFilledQuantity: null,
    exitAveragePrice: null,
    ...overrides,
  };
}

describe('MismatchDetector', () => {
  it('reports NO_DIFFERENCE across the board when local and broker agree', () => {
    const mismatches = MismatchDetector.detect(local(), broker());
    const overall = mismatches.map((m) => m.level);
    expect(overall.every((l) => l === MismatchLevel.NO_DIFFERENCE)).toBe(true);
  });

  it('marks non-broker-verifiable fields as NO_DIFFERENCE with an explanatory note', () => {
    const mismatches = MismatchDetector.detect(local(), broker());
    const symbolMismatch = mismatches.find((m) => m.field === 'tradingSymbol');
    expect(symbolMismatch?.level).toBe(MismatchLevel.NO_DIFFERENCE);
    expect(symbolMismatch?.description).toContain(
      'not independently broker-verifiable',
    );
  });

  describe('filled quantity (crash-after-broker-response scenario)', () => {
    it('flags ERROR when the broker is ahead of local — the safe-to-auto-repair case', () => {
      const mismatches = MismatchDetector.detect(
        local({ filledQuantity: 0, tradeState: TradeState.ENTRY_PENDING }),
        broker({ entryFilledQuantity: 50 }),
      );
      const filledQty = mismatches.find((m) => m.field === 'filledQuantity');
      expect(filledQty?.level).toBe(MismatchLevel.ERROR);
    });

    it('flags CRITICAL when local is ahead of the broker — never auto-repaired', () => {
      const mismatches = MismatchDetector.detect(
        local({ filledQuantity: 50 }),
        broker({ entryFilledQuantity: 20 }),
      );
      const filledQty = mismatches.find((m) => m.field === 'filledQuantity');
      expect(filledQty?.level).toBe(MismatchLevel.CRITICAL);
    });
  });

  describe('order state', () => {
    it('flags ERROR when local is still ENTRY_PENDING but broker confirms a fill', () => {
      const mismatches = MismatchDetector.detect(
        local({ tradeState: TradeState.ENTRY_PENDING }),
        broker({ entryOrderStatus: OrderStatus.FILLED }),
      );
      const orderState = mismatches.find((m) => m.field === 'orderState');
      expect(orderState?.level).toBe(MismatchLevel.ERROR);
    });

    it('flags CRITICAL when local believes it is ACTIVE but the broker rejected the order', () => {
      const mismatches = MismatchDetector.detect(
        local({ tradeState: TradeState.ACTIVE }),
        broker({ entryOrderStatus: OrderStatus.REJECTED }),
      );
      const orderState = mismatches.find((m) => m.field === 'orderState');
      expect(orderState?.level).toBe(MismatchLevel.CRITICAL);
    });

    it('mirrors its classification onto tradeState', () => {
      const mismatches = MismatchDetector.detect(
        local({ tradeState: TradeState.ACTIVE }),
        broker({ entryOrderStatus: OrderStatus.CANCELLED }),
      );
      const tradeState = mismatches.find((m) => m.field === 'tradeState');
      expect(tradeState?.level).toBe(MismatchLevel.CRITICAL);
    });
  });

  describe('position state', () => {
    it('flags ERROR when local shows an open position but the broker has already exited it', () => {
      const mismatches = MismatchDetector.detect(
        local({ openQuantity: 50 }),
        broker({ exitOrderStatus: OrderStatus.FILLED }),
      );
      const positionState = mismatches.find((m) => m.field === 'positionState');
      expect(positionState?.level).toBe(MismatchLevel.ERROR);
    });
  });

  describe('average price', () => {
    it('is NO_DIFFERENCE within a small epsilon', () => {
      const mismatches = MismatchDetector.detect(
        local({ averagePrice: 100.005 }),
        broker({ entryAveragePrice: 100.0 }),
      );
      expect(mismatches.find((m) => m.field === 'averagePrice')?.level).toBe(
        MismatchLevel.NO_DIFFERENCE,
      );
    });

    it('flags WARNING when prices genuinely diverge', () => {
      const mismatches = MismatchDetector.detect(
        local({ averagePrice: 100 }),
        broker({ entryAveragePrice: 105 }),
      );
      expect(mismatches.find((m) => m.field === 'averagePrice')?.level).toBe(
        MismatchLevel.WARNING,
      );
    });
  });

  it('handles a trade with no entry order id yet (never verifiable against the broker)', () => {
    const mismatches = MismatchDetector.detect(
      local({ entryOrderId: null, filledQuantity: 0 }),
      broker({
        entryOrderStatus: null,
        entryFilledQuantity: null,
        entryAveragePrice: null,
      }),
    );
    expect(
      mismatches.every((m) => m.level === MismatchLevel.NO_DIFFERENCE),
    ).toBe(true);
  });
});
