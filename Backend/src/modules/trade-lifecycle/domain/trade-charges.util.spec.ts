import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { calculateTradeCharges } from './trade-charges.util';

describe('calculateTradeCharges', () => {
  it('returns all-zero charges when no leg has any value yet', () => {
    const charges = calculateTradeCharges(TradeDirection.LONG, 0, 0);
    expect(charges.total).toBe(0);
    expect(charges.brokerage).toBe(0);
  });

  it('charges only entry-side costs for an open LONG trade (no exit yet)', () => {
    const charges = calculateTradeCharges(TradeDirection.LONG, 100_000, 0);
    expect(charges.stt).toBe(0); // STT is sell-side only; LONG hasn't sold yet.
    expect(charges.brokerage).toBeGreaterThan(0);
    expect(charges.stampDuty).toBeGreaterThan(0); // buy-side (entry, for LONG)
    expect(charges.total).toBeGreaterThan(0);
  });

  it('charges STT on the sell leg for a completed LONG trade (entry=buy, exit=sell)', () => {
    const charges = calculateTradeCharges(
      TradeDirection.LONG,
      100_000,
      105_000,
    );
    expect(charges.stt).toBeCloseTo(105_000 * 0.001, 5);
  });

  it('charges STT on the entry leg for a completed SHORT trade (entry=sell, exit=buy)', () => {
    const charges = calculateTradeCharges(
      TradeDirection.SHORT,
      100_000,
      95_000,
    );
    expect(charges.stt).toBeCloseTo(100_000 * 0.001, 5);
  });

  it('caps brokerage per leg at the flat fee for a large order', () => {
    const charges = calculateTradeCharges(
      TradeDirection.LONG,
      1_000_000,
      1_000_000,
    );
    // 0.03% of 1,000,000 = 300, far above the ₹20 flat cap — so brokerage
    // must be capped at 20 per leg = 40 total, not the percentage figure.
    expect(charges.brokerage).toBe(40);
  });

  it('never returns a negative total, and every component is deterministic (no randomness) across repeated calls', () => {
    const first = calculateTradeCharges(TradeDirection.LONG, 50_000, 52_000);
    const second = calculateTradeCharges(TradeDirection.LONG, 50_000, 52_000);
    expect(first).toEqual(second);
    expect(first.total).toBeGreaterThan(0);
  });

  it('GST is charged on brokerage + exchange charges only', () => {
    const charges = calculateTradeCharges(
      TradeDirection.LONG,
      100_000,
      100_000,
    );
    expect(charges.gst).toBeCloseTo(
      (charges.brokerage + charges.exchangeCharges) * 0.18,
      5,
    );
  });
});
