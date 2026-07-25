/**
 * Ranked from least to most severe (see HealthAggregationPolicy) — except
 * MAINTENANCE, which is never derived from indicators: it's an explicit
 * externally-set override that always wins regardless of indicator state.
 */
export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  WARNING = 'WARNING',
  DEGRADED = 'DEGRADED',
  DISCONNECTED = 'DISCONNECTED',
  RECOVERING = 'RECOVERING',
  MAINTENANCE = 'MAINTENANCE',
  UNKNOWN = 'UNKNOWN',
}
