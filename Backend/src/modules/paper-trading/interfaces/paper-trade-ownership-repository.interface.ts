import type { PaperTradeOwnership } from '../models/paper-trade-ownership.model';
import type { PaperTradeStatus } from '../models/paper-trade-status.enum';

export interface IPaperTradeOwnershipRepository {
  save(ownership: PaperTradeOwnership): Promise<void>;
  findById(id: string): Promise<PaperTradeOwnership | null>;
  findByQueueItemId(queueItemId: string): Promise<PaperTradeOwnership | null>;
  findByTradeId(tradeId: string): Promise<PaperTradeOwnership | null>;
  listByUser(userId: string, limit: number): Promise<PaperTradeOwnership[]>;
  countByUserAndStatuses(
    userId: string,
    statuses: readonly PaperTradeStatus[],
  ): Promise<number>;
}
