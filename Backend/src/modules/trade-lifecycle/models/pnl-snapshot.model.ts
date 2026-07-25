export interface PnlSnapshot {
  readonly tradeId: string;
  /** Unrealized PnL on the still-open quantity at the last known mark price; null before entry fills or before any tick has been observed. */
  readonly livePnl: number | null;
  /** PnL already locked in by every exit fill so far (partial or full). */
  readonly bookedPnl: number | null;
  /** Mark-to-market: bookedPnl + livePnl — the total PnL if the position were closed at the last known price right now. */
  readonly mtm: number | null;
  /** Raw price-point movement (direction-adjusted) between entry and the last known mark price. */
  readonly points: number | null;
  /** `points` expressed as a percentage of the entry price. */
  readonly percentage: number | null;
  readonly markPrice: number | null;
  readonly asOf: string;
}
