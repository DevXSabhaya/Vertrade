import type { PaperAccountStatus } from './paper-account-status.enum';

/**
 * Every balance figure is a domain operation away from mutation — no caller
 * outside `PaperAccountService` ever writes `availableBalance`/
 * `reservedMargin`/`realizedPnl` directly (Phase 12, Part 3).
 */
export interface PaperAccount {
  readonly userId: string;
  readonly initialBalance: number;
  readonly availableBalance: number;
  readonly reservedMargin: number;
  readonly realizedPnl: number;
  readonly status: PaperAccountStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The read-facing view — `equity` is idle cash plus capital currently tied up in open paper trades. */
export interface PaperAccountSummary extends PaperAccount {
  readonly equity: number;
}
