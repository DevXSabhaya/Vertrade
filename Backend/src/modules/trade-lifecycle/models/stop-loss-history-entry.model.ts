/** Where a given stop-loss move came from — Trade's own always-on per-target trailing rule (Phase 5), or this module's configurable TrailingManager (Phase 10). */
export type StopLossMoveSource = 'ENGINE_DEFAULT' | 'TRAILING_MANAGER';

export interface StopLossHistoryEntry {
  readonly tradeId: string;
  readonly previousStopLoss: number;
  readonly newStopLoss: number;
  readonly source: StopLossMoveSource;
  readonly movedAt: string;
}
