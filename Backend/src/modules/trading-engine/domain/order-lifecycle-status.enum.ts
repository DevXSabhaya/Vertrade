/**
 * The order-level lifecycle, distinct from (and nested inside) the trade-level
 * state machine: one Trade's entry leg and exit leg each carry their own
 * OrderLifecycleStatus over time. VALIDATED/QUEUED exist for completeness and
 * future integration with the Trade Validation Engine / Order Queue (later
 * phases) — the Trading Engine currently walks straight through them itself
 * since neither of those modules exists yet.
 */
export enum OrderLifecycleStatus {
  CREATED = 'CREATED',
  VALIDATED = 'VALIDATED',
  QUEUED = 'QUEUED',
  SUBMITTED = 'SUBMITTED',
  PENDING = 'PENDING',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  MODIFY_PENDING = 'MODIFY_PENDING',
  MODIFIED = 'MODIFIED',
  CANCEL_PENDING = 'CANCEL_PENDING',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
  COMPLETED = 'COMPLETED',
}
