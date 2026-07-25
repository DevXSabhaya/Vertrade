import { calculateUnrealizedPnl, calculateBookedPnl } from './pnl.util';
import { TradeDirection } from './trade-direction.enum';

describe('calculateUnrealizedPnl', () => {
  it('returns null before the entry fills (entryFillPrice is null)', () => {
    expect(
      calculateUnrealizedPnl(TradeDirection.LONG, null, 0, 0, 100),
    ).toBeNull();
  });

  it('returns null when filledQuantity is 0', () => {
    expect(
      calculateUnrealizedPnl(TradeDirection.LONG, 100, 0, 0, 110),
    ).toBeNull();
  });

  it('computes positive PnL for a LONG trade whose mark price rose', () => {
    expect(calculateUnrealizedPnl(TradeDirection.LONG, 100, 50, 50, 110)).toBe(
      500,
    );
  });

  it('computes negative PnL for a LONG trade whose mark price fell', () => {
    expect(calculateUnrealizedPnl(TradeDirection.LONG, 100, 50, 50, 90)).toBe(
      -500,
    );
  });

  it('computes positive PnL for a SHORT trade whose mark price fell', () => {
    expect(calculateUnrealizedPnl(TradeDirection.SHORT, 100, 50, 50, 90)).toBe(
      500,
    );
  });

  it('normalizes a break-even result to +0, never -0', () => {
    const result = calculateUnrealizedPnl(
      TradeDirection.SHORT,
      100,
      50,
      50,
      100,
    );
    expect(Object.is(result, -0)).toBe(false);
    expect(result).toBe(0);
  });

  it('uses openQuantity, not filledQuantity, once a partial exit has reduced it', () => {
    expect(calculateUnrealizedPnl(TradeDirection.LONG, 100, 50, 20, 110)).toBe(
      200,
    );
  });
});

describe('calculateBookedPnl', () => {
  it('returns null before any exit has filled (exitedQuantity is 0)', () => {
    expect(calculateBookedPnl(TradeDirection.LONG, 100, 0, 0)).toBeNull();
  });

  it('returns null when entryFillPrice is null', () => {
    expect(calculateBookedPnl(TradeDirection.LONG, null, 1000, 20)).toBeNull();
  });

  it('computes booked PnL for a LONG trade after a partial exit', () => {
    // Exited 20 units at avg 110 (proceeds 2200), entered at 100.
    expect(calculateBookedPnl(TradeDirection.LONG, 100, 2200, 20)).toBe(200);
  });

  it('computes booked PnL for a SHORT trade after a partial exit', () => {
    // Exited 20 units at avg 90 (proceeds 1800), entered at 100.
    expect(calculateBookedPnl(TradeDirection.SHORT, 100, 1800, 20)).toBe(200);
  });

  it('matches the full-close realizedPnl formula once exitedQuantity equals the entire filled quantity', () => {
    // 50 units entered at 100, fully exited at avg 110 (proceeds 5500).
    expect(calculateBookedPnl(TradeDirection.LONG, 100, 5500, 50)).toBe(500);
  });

  it('normalizes a break-even result to +0, never -0', () => {
    const result = calculateBookedPnl(TradeDirection.SHORT, 100, 5000, 50);
    expect(Object.is(result, -0)).toBe(false);
    expect(result).toBe(0);
  });
});
