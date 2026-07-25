import type { ITradeHistoryRepository } from '../interfaces/trade-history-repository.interface';
import type { TradeRecord } from '../models/trade-record.model';

export class FakeTradeHistoryRepository implements ITradeHistoryRepository {
  private readonly byId = new Map<string, TradeRecord>();

  save(record: TradeRecord): Promise<void> {
    this.byId.set(record.tradeId, record);
    return Promise.resolve();
  }

  findAll(limit: number, offset: number): Promise<TradeRecord[]> {
    return Promise.resolve(
      Array.from(this.byId.values())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(offset, offset + limit),
    );
  }

  findById(tradeId: string): Promise<TradeRecord | null> {
    return Promise.resolve(this.byId.get(tradeId) ?? null);
  }

  all(): readonly TradeRecord[] {
    return Array.from(this.byId.values());
  }
}
