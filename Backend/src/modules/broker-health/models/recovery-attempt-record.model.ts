export interface RecoveryAttemptRecord {
  readonly reason: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly succeeded: boolean;
  readonly error: string | null;
}
