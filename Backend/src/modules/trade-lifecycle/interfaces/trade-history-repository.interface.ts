import type { TradeRecord } from '../models/trade-record.model';

export interface ITradeHistoryRepository {
  save(record: TradeRecord): Promise<void>;
  findAll(limit: number, offset: number): Promise<TradeRecord[]>;
  findById(tradeId: string): Promise<TradeRecord | null>;
}
