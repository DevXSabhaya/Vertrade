import { calculateRiskReward } from './risk-reward.util';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';

describe('calculateRiskReward', () => {
  it('computes a 2:1 reward:risk for a LONG trade', () => {
    // risk = 100 - 95 = 5, reward = 110 - 100 = 10 -> 2
    expect(calculateRiskReward(TradeDirection.LONG, 100, 95, 110)).toBe(2);
  });

  it('computes a 3:1 reward:risk for a SHORT trade', () => {
    // risk = 100 - 105 (direction-adjusted) = 5, reward = 100-85 = 15 -> 3
    expect(calculateRiskReward(TradeDirection.SHORT, 100, 105, 85)).toBe(3);
  });

  it('returns null when there is no first target', () => {
    expect(
      calculateRiskReward(TradeDirection.LONG, 100, 95, undefined),
    ).toBeNull();
  });

  it('returns null when risk is zero (entry equals stop loss)', () => {
    expect(calculateRiskReward(TradeDirection.LONG, 100, 100, 110)).toBeNull();
  });
});
