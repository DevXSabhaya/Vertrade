import { TradeDirection } from './trade-direction.enum';
import { PriceCrossing } from './price-crossing.util';

describe('PriceCrossing', () => {
  describe('LONG', () => {
    it('crosses entry when price rises to or above the trigger', () => {
      expect(PriceCrossing.hasCrossedEntry(TradeDirection.LONG, 100, 100)).toBe(
        true,
      );
      expect(PriceCrossing.hasCrossedEntry(TradeDirection.LONG, 101, 100)).toBe(
        true,
      );
      expect(PriceCrossing.hasCrossedEntry(TradeDirection.LONG, 99, 100)).toBe(
        false,
      );
    });

    it('crosses a target when price rises to or above it', () => {
      expect(
        PriceCrossing.hasCrossedTarget(TradeDirection.LONG, 110, 110),
      ).toBe(true);
      expect(
        PriceCrossing.hasCrossedTarget(TradeDirection.LONG, 109, 110),
      ).toBe(false);
    });

    it('crosses stop loss when price falls to or below it', () => {
      expect(
        PriceCrossing.hasCrossedStopLoss(TradeDirection.LONG, 95, 95),
      ).toBe(true);
      expect(
        PriceCrossing.hasCrossedStopLoss(TradeDirection.LONG, 96, 95),
      ).toBe(false);
    });
  });

  describe('SHORT', () => {
    it('crosses entry when price falls to or below the trigger', () => {
      expect(
        PriceCrossing.hasCrossedEntry(TradeDirection.SHORT, 100, 100),
      ).toBe(true);
      expect(PriceCrossing.hasCrossedEntry(TradeDirection.SHORT, 99, 100)).toBe(
        true,
      );
      expect(
        PriceCrossing.hasCrossedEntry(TradeDirection.SHORT, 101, 100),
      ).toBe(false);
    });

    it('crosses a target when price falls to or below it', () => {
      expect(PriceCrossing.hasCrossedTarget(TradeDirection.SHORT, 90, 90)).toBe(
        true,
      );
      expect(PriceCrossing.hasCrossedTarget(TradeDirection.SHORT, 91, 90)).toBe(
        false,
      );
    });

    it('crosses stop loss when price rises to or above it', () => {
      expect(
        PriceCrossing.hasCrossedStopLoss(TradeDirection.SHORT, 105, 105),
      ).toBe(true);
      expect(
        PriceCrossing.hasCrossedStopLoss(TradeDirection.SHORT, 104, 105),
      ).toBe(false);
    });
  });
});
