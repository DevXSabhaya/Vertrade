import type { RecoveryStep } from './recovery-step.enum';

export interface RecoveryHistoryEntry {
  readonly id: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly succeeded: boolean | null;
  readonly finalState: string;
  readonly durationMs: number | null;
  readonly failureReason: string | null;
  readonly failedStep: RecoveryStep | null;
  /** Steps completed so far in this run — enables "never restart completed steps" on a resumed run. */
  readonly stepsCompleted: readonly RecoveryStep[];
  readonly tradesRecovered: number;
  readonly queueItemsRecovered: number;
}
