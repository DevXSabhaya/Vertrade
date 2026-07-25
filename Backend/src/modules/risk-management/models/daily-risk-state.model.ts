/** One row per UTC trading day. `tradeDate` is `YYYY-MM-DD` (UTC). */
export interface DailyRiskState {
  readonly tradeDate: string;
  readonly realizedPnl: number;
  readonly tradeCount: number;
  readonly consecutiveLosses: number;
  readonly lastTradeWasLoss: boolean | null;
  readonly updatedAt: string;
}

export function emptyDailyRiskState(
  tradeDate: string,
  now: string,
): DailyRiskState {
  return {
    tradeDate,
    realizedPnl: 0,
    tradeCount: 0,
    consecutiveLosses: 0,
    lastTradeWasLoss: null,
    updatedAt: now,
  };
}
