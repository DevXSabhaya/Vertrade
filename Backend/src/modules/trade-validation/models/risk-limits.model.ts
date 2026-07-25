export interface RiskLimitsConfig {
  readonly maxOpenTrades: number;
  readonly maxDailyTrades: number;
  /** Positive number; breached once today's realized PnL <= -maxDailyLoss. */
  readonly maxDailyLoss: number;
  readonly maxQuantity: number;
}

/** Deliberately generous — Paper trading exists precisely to be a safe sandbox. */
export const DEFAULT_PAPER_RISK_LIMITS: RiskLimitsConfig = {
  maxOpenTrades: 10,
  maxDailyTrades: 50,
  maxDailyLoss: 1_000_000,
  maxQuantity: 100_000,
};

/** Deliberately conservative — real money, real broker. */
export const DEFAULT_LIVE_RISK_LIMITS: RiskLimitsConfig = {
  maxOpenTrades: 5,
  maxDailyTrades: 20,
  maxDailyLoss: 50_000,
  maxQuantity: 5_000,
};

export function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
