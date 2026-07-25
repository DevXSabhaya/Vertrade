import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import {
  TrailingCalculator,
  type TrailingContext,
} from './trailing-calculator';
import { TrailingStrategy } from '../models/trailing-strategy.enum';
import type { TrailingConfiguration } from '../models/trailing-configuration.model';

function context(overrides: Partial<TrailingContext> = {}): TrailingContext {
  return {
    direction: TradeDirection.LONG,
    entryFillPrice: 100,
    currentStopLoss: 95,
    markPrice: 110,
    lastTrailingStepPrice: null,
    ...overrides,
  };
}

describe('TrailingCalculator', () => {
  describe('FIXED_POINTS', () => {
    it('trails a fixed number of points behind the mark price for a LONG trade', () => {
      const config: TrailingConfiguration = {
        strategy: TrailingStrategy.FIXED_POINTS,
        fixedPoints: 5,
      };
      const result = TrailingCalculator.compute(
        config,
        context({ markPrice: 110 }),
      );
      expect(result?.newStopLoss).toBe(105);
    });

    it('trails a fixed number of points ahead of the mark price for a SHORT trade', () => {
      const config: TrailingConfiguration = {
        strategy: TrailingStrategy.FIXED_POINTS,
        fixedPoints: 5,
      };
      const result = TrailingCalculator.compute(
        config,
        context({
          direction: TradeDirection.SHORT,
          entryFillPrice: 100,
          currentStopLoss: 105,
          markPrice: 90,
        }),
      );
      expect(result?.newStopLoss).toBe(95);
    });

    it('returns null when fixedPoints is not configured', () => {
      const config: TrailingConfiguration = {
        strategy: TrailingStrategy.FIXED_POINTS,
      };
      expect(TrailingCalculator.compute(config, context())).toBeNull();
    });
  });

  describe('PERCENTAGE', () => {
    it('trails a percentage of the mark price behind it', () => {
      const config: TrailingConfiguration = {
        strategy: TrailingStrategy.PERCENTAGE,
        percentage: 10,
      };
      const result = TrailingCalculator.compute(
        config,
        context({ markPrice: 100 }),
      );
      expect(result?.newStopLoss).toBe(90);
    });
  });

  describe('STEP', () => {
    const config: TrailingConfiguration = {
      strategy: TrailingStrategy.STEP,
      stepSize: 10,
    };

    it('does not propose a move before price has advanced a full step', () => {
      const result = TrailingCalculator.compute(
        config,
        context({
          entryFillPrice: 100,
          markPrice: 105,
          lastTrailingStepPrice: null,
        }),
      );
      expect(result).toBeNull();
    });

    it('proposes a move once price crosses a full step, and records the new step boundary', () => {
      const result = TrailingCalculator.compute(
        config,
        context({
          entryFillPrice: 100,
          markPrice: 111,
          lastTrailingStepPrice: null,
        }),
      );
      expect(result?.newStopLoss).toBe(110);
      expect(result?.newLastStepPrice).toBe(110);
    });

    it('measures the next step from the last recorded step boundary, not the entry price', () => {
      const result = TrailingCalculator.compute(
        config,
        context({
          entryFillPrice: 100,
          markPrice: 121,
          lastTrailingStepPrice: 110,
        }),
      );
      expect(result?.newStopLoss).toBe(120);
    });
  });

  describe('BREAK_EVEN', () => {
    const config: TrailingConfiguration = {
      strategy: TrailingStrategy.BREAK_EVEN,
    };

    it('proposes moving the stop loss to entry once the trade is in profit', () => {
      const result = TrailingCalculator.compute(
        config,
        context({ entryFillPrice: 100, currentStopLoss: 95, markPrice: 105 }),
      );
      expect(result?.newStopLoss).toBe(100);
    });

    it('does not propose anything while still at a loss', () => {
      const result = TrailingCalculator.compute(
        config,
        context({ entryFillPrice: 100, currentStopLoss: 95, markPrice: 98 }),
      );
      expect(result).toBeNull();
    });

    it('does not re-propose once already at or past break-even', () => {
      const result = TrailingCalculator.compute(
        config,
        context({ entryFillPrice: 100, currentStopLoss: 100, markPrice: 108 }),
      );
      expect(result).toBeNull();
    });
  });

  describe('ATR — architecture only', () => {
    it('never proposes a value (no volatility data source exists in this system)', () => {
      const config: TrailingConfiguration = {
        strategy: TrailingStrategy.ATR,
        atrMultiplier: 2,
      };
      expect(TrailingCalculator.compute(config, context())).toBeNull();
    });
  });

  describe('lockProfitPoints', () => {
    it('floors a LONG proposal so a configured amount of profit is never given back', () => {
      const config: TrailingConfiguration = {
        strategy: TrailingStrategy.FIXED_POINTS,
        fixedPoints: 20,
        lockProfitPoints: 2,
      };
      // Raw proposal: 110 - 20 = 90 (below entry). Floor: 100 + 2 = 102.
      const result = TrailingCalculator.compute(
        config,
        context({ entryFillPrice: 100, markPrice: 110 }),
      );
      expect(result?.newStopLoss).toBe(102);
    });

    it('does not lower an already-favorable proposal', () => {
      const config: TrailingConfiguration = {
        strategy: TrailingStrategy.FIXED_POINTS,
        fixedPoints: 5,
        lockProfitPoints: 2,
      };
      // Raw proposal: 110 - 5 = 105, already above the 102 floor.
      const result = TrailingCalculator.compute(
        config,
        context({ entryFillPrice: 100, markPrice: 110 }),
      );
      expect(result?.newStopLoss).toBe(105);
    });
  });
});
