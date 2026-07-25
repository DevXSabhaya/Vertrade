/**
 * Typed reason codes for a RiskDecision (Phase 11 spec, Part 14). The exact
 * codes the spec names are all present; a handful of additional codes exist
 * for conditions the spec describes narratively but doesn't name explicitly
 * (marked below) — kept in the same enum rather than a parallel one so every
 * RiskDecision carries exactly one discriminated reason.
 */
export enum RiskReasonCode {
  DAILY_LOSS_LIMIT_BREACHED = 'DAILY_LOSS_LIMIT_BREACHED',
  MAX_OPEN_TRADES_REACHED = 'MAX_OPEN_TRADES_REACHED',
  MAX_EXPOSURE_REACHED = 'MAX_EXPOSURE_REACHED',
  MAX_QUANTITY_EXCEEDED = 'MAX_QUANTITY_EXCEEDED',
  MAX_RISK_PER_TRADE_EXCEEDED = 'MAX_RISK_PER_TRADE_EXCEEDED',
  DUPLICATE_POSITION = 'DUPLICATE_POSITION',
  COOLDOWN_ACTIVE = 'COOLDOWN_ACTIVE',
  KILL_SWITCH_ACTIVE = 'KILL_SWITCH_ACTIVE',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  BROKER_UNAVAILABLE = 'BROKER_UNAVAILABLE',
  MARKET_DATA_UNAVAILABLE = 'MARKET_DATA_UNAVAILABLE',
  EMERGENCY_STOP_ACTIVE = 'EMERGENCY_STOP_ACTIVE',
  /** Not named explicitly by the spec's reason-code list, but required by Part 5 (Capital Allocation) and Part 9 (Consecutive Loss Protection), each a distinct control from the codes above. */
  MAX_CAPITAL_EXCEEDED = 'MAX_CAPITAL_EXCEEDED',
  MAX_CONSECUTIVE_LOSSES_REACHED = 'MAX_CONSECUTIVE_LOSSES_REACHED',
}
