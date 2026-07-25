import type { IPaperTradeOwnershipRepository } from '../interfaces/paper-trade-ownership-repository.interface';
import type { PaperTradeOwnership } from '../models/paper-trade-ownership.model';
import type { PaperTradeStatus } from '../models/paper-trade-status.enum';

export class InMemoryPaperTradeOwnershipRepository implements IPaperTradeOwnershipRepository {
  private rows = new Map<string, PaperTradeOwnership>();

  save(ownership: PaperTradeOwnership): Promise<void> {
    this.rows.set(ownership.id, ownership);
    return Promise.resolve();
  }

  findById(id: string): Promise<PaperTradeOwnership | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findByQueueItemId(queueItemId: string): Promise<PaperTradeOwnership | null> {
    return Promise.resolve(
      Array.from(this.rows.values()).find(
        (r) => r.queueItemId === queueItemId,
      ) ?? null,
    );
  }

  findByTradeId(tradeId: string): Promise<PaperTradeOwnership | null> {
    return Promise.resolve(
      Array.from(this.rows.values()).find((r) => r.tradeId === tradeId) ?? null,
    );
  }

  listByUser(userId: string, limit: number): Promise<PaperTradeOwnership[]> {
    return Promise.resolve(
      Array.from(this.rows.values())
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit),
    );
  }

  countByUserAndStatuses(
    userId: string,
    statuses: readonly PaperTradeStatus[],
  ): Promise<number> {
    return Promise.resolve(
      Array.from(this.rows.values()).filter(
        (r) => r.userId === userId && statuses.includes(r.status),
      ).length,
    );
  }
}
