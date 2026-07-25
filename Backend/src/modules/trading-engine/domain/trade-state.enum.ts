/**
 * The complete trade-level state machine, exactly as defined in the frozen
 * architecture. TargetHit and TrailingSLUpdated are real, observable states —
 * not just events — but they are transient: a single price evaluation always
 * walks Active -> TargetHit -> TrailingSLUpdated -> Active before returning
 * control to the caller, so they are never the state a Trade is "at rest" in
 * between price ticks.
 */
export enum TradeState {
  DRAFT = 'DRAFT',
  WAITING_ENTRY = 'WAITING_ENTRY',
  ENTRY_PENDING = 'ENTRY_PENDING',
  ENTRY_FILLED = 'ENTRY_FILLED',
  ACTIVE = 'ACTIVE',
  TARGET_HIT = 'TARGET_HIT',
  TRAILING_SL_UPDATED = 'TRAILING_SL_UPDATED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
  RECOVERY = 'RECOVERY',
  ERROR = 'ERROR',
}
