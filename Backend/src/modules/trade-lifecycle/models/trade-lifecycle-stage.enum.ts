/**
 * The full granular lifecycle stage catalog (Phase 10 spec). This is a
 * derived, read-only reporting view — never a second state machine. It is
 * computed purely from the existing (frozen, Phase 5) `TradeState` +
 * `OrderLifecycleStatus`, plus the handful of extension fields this module
 * owns (`exitReason`, target progression). See
 * `deriveTradeLifecycleStage()` for the exact mapping.
 */
export enum TradeLifecycleStage {
  CREATED = 'CREATED',
  VALIDATED = 'VALIDATED',
  QUEUED = 'QUEUED',
  ORDER_PLACED = 'ORDER_PLACED',
  ORDER_PENDING = 'ORDER_PENDING',
  ORDER_FILLED = 'ORDER_FILLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  POSITION_OPEN = 'POSITION_OPEN',
  TARGET1_HIT = 'TARGET1_HIT',
  TARGET2_HIT = 'TARGET2_HIT',
  TARGET3_HIT = 'TARGET3_HIT',
  TRAILING_SL = 'TRAILING_SL',
  EXIT_REQUESTED = 'EXIT_REQUESTED',
  EXIT_PENDING = 'EXIT_PENDING',
  EXIT_FILLED = 'EXIT_FILLED',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  STOPLOSS_HIT = 'STOPLOSS_HIT',
  FORCE_EXITED = 'FORCE_EXITED',
  MANUAL_EXIT = 'MANUAL_EXIT',
}
