import { TrailingStrategy } from './trailing-strategy.enum';

/**
 * Configuration for TrailingManager's per-tick stop-loss proposal. Only the
 * field(s) relevant to the selected `strategy` are read; the rest are
 * ignored (validated once, at configuration time, by
 * `TrailingConfigurationValidator` — see `trailing-calculator.ts`).
 */
export interface TrailingConfiguration {
  readonly strategy: TrailingStrategy;
  /** FIXED_POINTS: trail this many price points behind the mark price. */
  readonly fixedPoints?: number;
  /** PERCENTAGE: trail this percentage of the mark price behind it (e.g. 1.5 = 1.5%). */
  readonly percentage?: number;
  /** STEP: only move the stop loss once price has advanced this many points past the last step. */
  readonly stepSize?: number;
  /** ATR: architecture only — see TrailingStrategy.ATR. */
  readonly atrMultiplier?: number;
  /** Once a strategy proposes a stop loss, additionally floor it at (entry price ± this many points) so a configured amount of profit is never given back. */
  readonly lockProfitPoints?: number;
}
