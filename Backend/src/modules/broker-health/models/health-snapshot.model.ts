import type { HealthStatus } from './health-status.enum';

/**
 * The dashboard model — everything a future frontend health widget needs in
 * one normalized object. Exactly the field list the frozen architecture
 * specifies.
 */
export interface HealthSnapshot {
  readonly timestamp: string;
  readonly overallStatus: HealthStatus;
  readonly brokerStatus: HealthStatus;
  readonly restApiStatus: HealthStatus;
  readonly websocketStatus: HealthStatus;
  readonly marketDataStatus: HealthStatus;
  readonly authStatus: HealthStatus;
  readonly schedulerStatus: HealthStatus;
  readonly databaseStatus: HealthStatus;
  readonly queueStatus: HealthStatus;
  readonly latency: number | null;
  readonly heartbeatAge: number | null;
  readonly lastSuccessfulRequest: string | null;
  readonly activeSubscriptions: number;
  readonly connectedSince: string | null;
}
