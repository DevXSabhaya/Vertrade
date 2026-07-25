import type { QueueItemSnapshot } from '../models/queue-item-snapshot';

/**
 * Persistence is purely a durability/recovery concern: OrderQueueService's
 * in-memory map is the source of truth during normal operation (fast,
 * synchronous), and every state transition is also written here so a
 * restart can rebuild that map — see Part 17 "Repository: Persist queue
 * state. Recover after restart. Prevent duplicate execution."
 */
export interface IQueueItemRepository {
  save(snapshot: QueueItemSnapshot): Promise<void>;
  findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<QueueItemSnapshot | null>;
  /** Every item not yet in a terminal state — what a restart must resume. */
  findRecoverable(): Promise<QueueItemSnapshot[]>;
}
