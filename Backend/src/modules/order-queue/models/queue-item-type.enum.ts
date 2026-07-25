/**
 * Only CREATE_TRADE flows through the queue today (Phase 7 scope). Modify /
 * Cancel / Exit order-queue flows are future extensions — adding one is a new
 * enum member plus a new branch where OrderQueueService dispatches to the
 * Trading Engine, never a change to the queue/lock/retry machinery itself.
 */
export enum QueueItemType {
  CREATE_TRADE = 'CREATE_TRADE',
}
