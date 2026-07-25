/** Identifies which IOrderExecutor implementation produced/handled an order — for logging/audit only. */
export enum ExecutorMode {
  PAPER = 'PAPER',
  LIVE = 'LIVE',
}
