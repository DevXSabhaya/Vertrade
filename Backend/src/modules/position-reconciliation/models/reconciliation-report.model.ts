import type { MismatchLevel } from './mismatch-level.enum';
import type { PositionMismatch } from './position-mismatch.model';

export interface ReconciliationReport {
  readonly id: string;
  readonly tradeId: string;
  readonly generatedAt: string;
  readonly mismatches: readonly PositionMismatch[];
  readonly overallLevel: MismatchLevel;
  readonly autoRepaired: boolean;
  readonly manualReviewRequired: boolean;
}
