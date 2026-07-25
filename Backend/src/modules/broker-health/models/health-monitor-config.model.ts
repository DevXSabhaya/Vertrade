export interface HealthMonitorConfig {
  readonly healthCheckIntervalMs: number;
  readonly heartbeatTimeoutMs: number;
  readonly retryCount: number;
  readonly reconnectBaseDelayMs: number;
  readonly reconnectMaxDelayMs: number;
  readonly reconnectJitterRatio: number;
  readonly brokerTimeoutMs: number;
  readonly instrumentFreshnessThresholdMs: number;
  readonly maintenanceMode: boolean;
}

export const DEFAULT_HEALTH_MONITOR_CONFIG: HealthMonitorConfig = {
  healthCheckIntervalMs: 30_000,
  heartbeatTimeoutMs: 15_000,
  retryCount: 3,
  reconnectBaseDelayMs: 1_000,
  reconnectMaxDelayMs: 30_000,
  reconnectJitterRatio: 0.2,
  brokerTimeoutMs: 10_000,
  instrumentFreshnessThresholdMs: 24 * 60 * 60 * 1000,
  maintenanceMode: false,
};
