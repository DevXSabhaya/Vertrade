export interface RecoveryConfig {
  /** Max additional attempts (beyond the first) for a retryable step before it fails the whole run. */
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
  readonly retryJitterRatio: number;
  /** Minimum spacing between two automatic snapshot captures triggered by event traffic. */
  readonly snapshotDebounceMs: number;
  /** How often RecoveryScheduler re-runs Position Reconciliation once recovery has completed. */
  readonly reconciliationIntervalMs: number;
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  maxRetries: 3,
  retryBaseDelayMs: 500,
  retryMaxDelayMs: 10_000,
  retryJitterRatio: 0.2,
  snapshotDebounceMs: 2_000,
  reconciliationIntervalMs: 5 * 60 * 1000,
};
