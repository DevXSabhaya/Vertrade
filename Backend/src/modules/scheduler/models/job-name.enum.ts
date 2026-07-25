export enum JobName {
  MORNING_STARTUP = 'MORNING_STARTUP',
  MARKET_CLOSE = 'MARKET_CLOSE',
  HEALTH_CHECK = 'HEALTH_CHECK',
  INSTRUMENT_REFRESH = 'INSTRUMENT_REFRESH',
  CLEANUP = 'CLEANUP',
  /** Phase 11 — daily risk reset, cooldown expiry, and circuit breaker recovery checks (see RiskMaintenanceJob). */
  RISK_MAINTENANCE = 'RISK_MAINTENANCE',
}
