import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TrailingStrategy } from '../models/trailing-strategy.enum';
import type { TrailingConfiguration } from '../models/trailing-configuration.model';

export interface TrailingContext {
  readonly direction: TradeDirection;
  readonly entryFillPrice: number;
  readonly currentStopLoss: number;
  readonly markPrice: number;
  readonly lastTrailingStepPrice: number | null;
}

export interface TrailingProposal {
  readonly newStopLoss: number;
  /** Only set (and only meaningful) for the STEP strategy — the new step boundary to persist on the TradeExtension for next tick's comparison. */
  readonly newLastStepPrice?: number;
}

/**
 * Production-grade, strategy-driven stop-loss proposal logic (Phase 10's
 * Trailing Stop Engine). Every strategy here is a *proposal* only — the
 * caller (`TrailingManager`) hands the result to
 * `TradingEngineService.updateTrailingStopLoss()`, which delegates to
 * `Trade.moveStopLoss()`, the one place that actually enforces "never move
 * the stop loss backward." A strategy here is free to (and sometimes does)
 * propose a value that doesn't improve on the current stop loss; the
 * aggregate is what makes that safe to do unconditionally.
 */
export const TrailingCalculator = {
  compute(
    config: TrailingConfiguration,
    context: TrailingContext,
  ): TrailingProposal | null {
    const raw = this.computeRaw(config, context);
    if (raw === null) {
      return null;
    }
    const floored = this.applyProfitLock(config, context, raw.newStopLoss);
    return { ...raw, newStopLoss: floored };
  },

  computeRaw(
    config: TrailingConfiguration,
    context: TrailingContext,
  ): TrailingProposal | null {
    switch (config.strategy) {
      case TrailingStrategy.FIXED_POINTS:
        return this.fixedPoints(config, context);
      case TrailingStrategy.PERCENTAGE:
        return this.percentage(config, context);
      case TrailingStrategy.STEP:
        return this.step(config, context);
      case TrailingStrategy.BREAK_EVEN:
        return this.breakEven(context);
      case TrailingStrategy.ATR:
        // Architecture only — see TrailingStrategy.ATR's docstring. No ATR
        // (volatility) data source exists in this system; proposing a
        // fabricated value would be worse than proposing nothing.
        return null;
    }
  },

  fixedPoints(
    config: TrailingConfiguration,
    context: TrailingContext,
  ): TrailingProposal | null {
    if (config.fixedPoints === undefined || config.fixedPoints <= 0) {
      return null;
    }
    const newStopLoss =
      context.direction === TradeDirection.LONG
        ? context.markPrice - config.fixedPoints
        : context.markPrice + config.fixedPoints;
    return { newStopLoss };
  },

  percentage(
    config: TrailingConfiguration,
    context: TrailingContext,
  ): TrailingProposal | null {
    if (config.percentage === undefined || config.percentage <= 0) {
      return null;
    }
    const offset = context.markPrice * (config.percentage / 100);
    const newStopLoss =
      context.direction === TradeDirection.LONG
        ? context.markPrice - offset
        : context.markPrice + offset;
    return { newStopLoss };
  },

  step(
    config: TrailingConfiguration,
    context: TrailingContext,
  ): TrailingProposal | null {
    if (config.stepSize === undefined || config.stepSize <= 0) {
      return null;
    }
    const basePrice = context.lastTrailingStepPrice ?? context.entryFillPrice;
    const favorableMove =
      context.direction === TradeDirection.LONG
        ? context.markPrice - basePrice
        : basePrice - context.markPrice;
    if (favorableMove < config.stepSize) {
      return null;
    }
    const stepsCrossed = Math.floor(favorableMove / config.stepSize);
    const newStepPrice =
      context.direction === TradeDirection.LONG
        ? basePrice + stepsCrossed * config.stepSize
        : basePrice - stepsCrossed * config.stepSize;
    return { newStopLoss: newStepPrice, newLastStepPrice: newStepPrice };
  },

  breakEven(context: TrailingContext): TrailingProposal | null {
    const alreadyAtOrPastBreakEven =
      context.direction === TradeDirection.LONG
        ? context.currentStopLoss >= context.entryFillPrice
        : context.currentStopLoss <= context.entryFillPrice;
    if (alreadyAtOrPastBreakEven) {
      return null;
    }
    const inProfit =
      context.direction === TradeDirection.LONG
        ? context.markPrice > context.entryFillPrice
        : context.markPrice < context.entryFillPrice;
    if (!inProfit) {
      return null;
    }
    return { newStopLoss: context.entryFillPrice };
  },

  applyProfitLock(
    config: TrailingConfiguration,
    context: TrailingContext,
    proposedStopLoss: number,
  ): number {
    if (config.lockProfitPoints === undefined || config.lockProfitPoints <= 0) {
      return proposedStopLoss;
    }
    const floor =
      context.direction === TradeDirection.LONG
        ? context.entryFillPrice + config.lockProfitPoints
        : context.entryFillPrice - config.lockProfitPoints;
    return context.direction === TradeDirection.LONG
      ? Math.max(proposedStopLoss, floor)
      : Math.min(proposedStopLoss, floor);
  },
};
