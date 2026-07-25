export enum PaperTradeStatus {
  /** Submitted to the Order Queue; the Trading Engine has not created the underlying trade yet. */
  PENDING = 'PENDING',
  /** The underlying trade exists in the Trading Engine and is being managed by Trade Lifecycle. */
  OPEN = 'OPEN',
  /** The underlying trade reached a final state and the reserved margin has been settled. */
  CLOSED = 'CLOSED',
  /** Rejected by validation/risk, or failed permanently in the Order Queue; the reservation was rolled back. */
  FAILED = 'FAILED',
  /** Cancelled by the user while still PENDING; the reservation was rolled back. */
  CANCELLED = 'CANCELLED',
}
