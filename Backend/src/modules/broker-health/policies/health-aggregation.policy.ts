import { HealthStatus } from '../models/health-status.enum';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';

/**
 * Severity ranking, least to most severe. MAINTENANCE is deliberately absent
 * — it is never derived from indicators, only ever set explicitly by an
 * operator, and always wins over whatever the indicators would otherwise say.
 */
const SEVERITY_ORDER: readonly HealthStatus[] = [
  HealthStatus.HEALTHY,
  HealthStatus.UNKNOWN,
  HealthStatus.WARNING,
  HealthStatus.RECOVERING,
  HealthStatus.DEGRADED,
  HealthStatus.DISCONNECTED,
];

export const HealthAggregationPolicy = {
  /** The overall status is the single most severe status among all indicators. */
  aggregate(results: readonly HealthIndicatorResult[]): HealthStatus {
    return this.aggregateStatuses(results.map((result) => result.status));
  },

  aggregateStatuses(statuses: readonly HealthStatus[]): HealthStatus {
    if (statuses.length === 0) {
      return HealthStatus.UNKNOWN;
    }
    let worst = HealthStatus.HEALTHY;
    for (const status of statuses) {
      if (this.severityOf(status) > this.severityOf(worst)) {
        worst = status;
      }
    }
    return worst;
  },

  severityOf(status: HealthStatus): number {
    const index = SEVERITY_ORDER.indexOf(status);
    return index === -1 ? SEVERITY_ORDER.length : index;
  },

  isMoreSevere(a: HealthStatus, b: HealthStatus): boolean {
    return this.severityOf(a) > this.severityOf(b);
  },
};
