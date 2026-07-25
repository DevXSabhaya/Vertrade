import type { ITradeExtensionRepository } from '../interfaces/trade-extension-repository.interface';
import type { TradeExtension } from '../models/trade-extension.model';

export class FakeTradeExtensionRepository implements ITradeExtensionRepository {
  private readonly byId = new Map<string, TradeExtension>();

  save(extension: TradeExtension): Promise<void> {
    this.byId.set(extension.tradeId, extension);
    return Promise.resolve();
  }

  find(tradeId: string): Promise<TradeExtension | null> {
    return Promise.resolve(this.byId.get(tradeId) ?? null);
  }

  findAll(tradeIds: readonly string[]): Promise<TradeExtension[]> {
    return Promise.resolve(
      tradeIds
        .map((id) => this.byId.get(id))
        .filter((e): e is TradeExtension => e !== undefined),
    );
  }

  seed(extension: TradeExtension): void {
    this.byId.set(extension.tradeId, extension);
  }
}
