export interface BrokerHealthMetricsSnapshot {
  readonly uptimeMs: number | null;
  readonly reconnectCount: number;
  readonly averageHeartbeatLatencyMs: number | null;
  readonly recoveryAttempts: number;
  readonly failedHealthChecks: number;
  readonly averageResponseTimeMs: number | null;
}
