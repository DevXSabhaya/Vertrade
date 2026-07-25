/**
 * The granular, individually-retryable/skippable units of work inside the
 * Recovery Flow (Part 2 of the Phase 9 spec) — finer-grained than
 * RecoveryState, since a single state transition can bundle bookkeeping for
 * more than one named step (e.g. "Restore Order Queue" and "Restore
 * Idempotency Keys" both complete on the way to `QUEUE_RECOVERED`).
 */
export enum RecoveryStep {
  LOAD_CONFIGURATION = 'LOAD_CONFIGURATION',
  VERIFY_DATABASE = 'VERIFY_DATABASE',
  RESTORE_FEATURE_FLAGS = 'RESTORE_FEATURE_FLAGS',
  RESTORE_SETTINGS = 'RESTORE_SETTINGS',
  RESTORE_BROKER_AUTHENTICATION = 'RESTORE_BROKER_AUTHENTICATION',
  RECONNECT_BROKER = 'RECONNECT_BROKER',
  RECONNECT_MARKET_DATA = 'RECONNECT_MARKET_DATA',
  RELOAD_INSTRUMENT_MASTER = 'RELOAD_INSTRUMENT_MASTER',
  RESTORE_ACTIVE_TRADES = 'RESTORE_ACTIVE_TRADES',
  RESTORE_ORDER_QUEUE = 'RESTORE_ORDER_QUEUE',
  RESTORE_IDEMPOTENCY_KEYS = 'RESTORE_IDEMPOTENCY_KEYS',
  RESTORE_PENDING_ORDERS = 'RESTORE_PENDING_ORDERS',
  RESTORE_TRADING_ENGINE = 'RESTORE_TRADING_ENGINE',
  /** Phase 11 — reloads Risk Policy, Kill Switch, Emergency Stop, and Cooldown state from Mongo, and recalculates the daily risk state. */
  RESTORE_RISK_STATE = 'RESTORE_RISK_STATE',
  RESUME_TICK_PROCESSING = 'RESUME_TICK_PROCESSING',
  RESUME_MONITORING = 'RESUME_MONITORING',
  VERIFY_POSITIONS = 'VERIFY_POSITIONS',
}

/** Steps considered network/broker/database-dependent: safe to retry with backoff. */
export const RETRYABLE_STEPS: ReadonlySet<RecoveryStep> = new Set([
  RecoveryStep.VERIFY_DATABASE,
  RecoveryStep.RESTORE_BROKER_AUTHENTICATION,
  RecoveryStep.RECONNECT_BROKER,
  RecoveryStep.RECONNECT_MARKET_DATA,
  RecoveryStep.RELOAD_INSTRUMENT_MASTER,
]);
