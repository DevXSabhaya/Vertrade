import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import {
  calculateExposure,
  calculatePointRisk,
  calculateRupeeRisk,
  calculateRiskPercentage,
} from './risk-calculations.util';

describe('risk-calculations.util', () => {
  describe('calculateExposure', () => {
    it('multiplies price by quantity', () => {
      expect(calculateExposure(100, 50)).toBe(5000);
    });

    it('returns 0 when quantity is 0', () => {
      expect(calculateExposure(100, 0)).toBe(0);
    });
  });

  describe('calculatePointRisk', () => {
    it('returns entry minus stop loss for a LONG trade', () => {
      expect(calculatePointRisk(TradeDirection.LONG, 100, 95)).toBe(5);
    });

    it('returns stop loss minus entry for a SHORT trade', () => {
      expect(calculatePointRisk(TradeDirection.SHORT, 100, 105)).toBe(5);
    });

    it('returns 0 when entry equals stop loss', () => {
      expect(calculatePointRisk(TradeDirection.LONG, 100, 100)).toBe(0);
    });
  });

  describe('calculateRupeeRisk', () => {
    it('multiplies point risk by quantity', () => {
      expect(calculateRupeeRisk(5, 50)).toBe(250);
    });

    it('returns 0 when point risk is 0', () => {
      expect(calculateRupeeRisk(0, 50)).toBe(0);
    });
  });

  describe('calculateRiskPercentage', () => {
    it('computes percentage of the capital base', () => {
      expect(calculateRiskPercentage(250, 10_000)).toBe(2.5);
    });

    it('returns 0 when capital base is 0', () => {
      expect(calculateRiskPercentage(250, 0)).toBe(0);
    });

    it('returns 0 when capital base is negative', () => {
      expect(calculateRiskPercentage(250, -100)).toBe(0);
    });
  });
});
