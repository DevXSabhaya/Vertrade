import type { TradeExtension } from '../models/trade-extension.model';

export interface ITradeExtensionRepository {
  save(extension: TradeExtension): Promise<void>;
  find(tradeId: string): Promise<TradeExtension | null>;
  findAll(tradeIds: readonly string[]): Promise<TradeExtension[]>;
}
