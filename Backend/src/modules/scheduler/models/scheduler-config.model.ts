export interface SchedulerConfig {
  readonly healthCheckIntervalMs: number;
  readonly instrumentRefreshIntervalMs: number;
  readonly cleanupIntervalMs: number;
  readonly queueExpiryThresholdMs: number;
  readonly marketOpenTime: string;
  readonly marketCloseTime: string;
  /** Phase 11 — how often RiskMaintenanceJob checks for a day rollover, expired cooldowns, and circuit breaker recovery. */
  readonly riskMaintenanceIntervalMs: number;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  healthCheckIntervalMs: 30_000,
  instrumentRefreshIntervalMs: 24 * 60 * 60 * 1000,
  cleanupIntervalMs: 60 * 60 * 1000,
  queueExpiryThresholdMs: 60 * 60 * 1000,
  marketOpenTime: '09:15',
  marketCloseTime: '15:30',
  riskMaintenanceIntervalMs: 60_000,
};
