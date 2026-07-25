import type { HealthStatus } from './health-status.enum';

export interface HealthIndicatorResult {
  readonly name: string;
  readonly status: HealthStatus;
  readonly message?: string;
  readonly checkedAt: string;
  readonly latencyMs?: number;
}
