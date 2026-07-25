import type { IQueueItemRepository } from '../interfaces/queue-item-repository.interface';
import type { QueueItemSnapshot } from '../models/queue-item-snapshot';
import { QueueItemTransitions } from '../models/queue-item-transitions';

/** In-memory stand-in for Mongo persistence — no real database in unit tests. */
export class FakeQueueItemRepository implements IQueueItemRepository {
  private readonly byIdempotencyKey = new Map<string, QueueItemSnapshot>();

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IQueueItemRepository
  async save(snapshot: QueueItemSnapshot): Promise<void> {
    this.byIdempotencyKey.set(snapshot.idempotencyKey, snapshot);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IQueueItemRepository
  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<QueueItemSnapshot | null> {
    return this.byIdempotencyKey.get(idempotencyKey) ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IQueueItemRepository
  async findRecoverable(): Promise<QueueItemSnapshot[]> {
    return Array.from(this.byIdempotencyKey.values()).filter(
      (snapshot) => !QueueItemTransitions.isTerminal(snapshot.state),
    );
  }

  seed(snapshot: QueueItemSnapshot): void {
    this.byIdempotencyKey.set(snapshot.idempotencyKey, snapshot);
  }
}
