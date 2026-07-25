import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TRADE_EXTENSION_REPOSITORY } from './trade-lifecycle.constants';
import type { ITradeExtensionRepository } from './interfaces/trade-extension-repository.interface';
import {
  defaultTradeExtension,
  type TradeExtension,
} from './models/trade-extension.model';

/**
 * The single place every Phase 10 manager goes to read/patch a trade's
 * extension record — avoids each of StopLossManager/TargetManager/
 * ExitManager/TrailingManager independently re-implementing "load, apply
 * the default if this trade has never had an extension row, merge a patch,
 * save." Not one of the spec's named services; a private implementation
 * detail shared by several of them.
 */
@Injectable()
export class TradeExtensionStore {
  constructor(
    @Inject(TRADE_EXTENSION_REPOSITORY)
    private readonly repository: ITradeExtensionRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async get(tradeId: string): Promise<TradeExtension> {
    const existing = await this.repository.find(tradeId);
    return (
      existing ?? defaultTradeExtension(tradeId, this.clock.now().toISOString())
    );
  }

  async getMany(
    tradeIds: readonly string[],
  ): Promise<Map<string, TradeExtension>> {
    const found = await this.repository.findAll(tradeIds);
    const byId = new Map(
      found.map((extension) => [extension.tradeId, extension]),
    );
    const now = this.clock.now().toISOString();
    for (const tradeId of tradeIds) {
      if (!byId.has(tradeId)) {
        byId.set(tradeId, defaultTradeExtension(tradeId, now));
      }
    }
    return byId;
  }

  async patch(
    tradeId: string,
    patch: Partial<Omit<TradeExtension, 'tradeId' | 'createdAt'>>,
  ): Promise<TradeExtension> {
    const current = await this.get(tradeId);
    const updated: TradeExtension = {
      ...current,
      ...patch,
      tradeId,
      updatedAt: this.clock.now().toISOString(),
    };
    await this.repository.save(updated);
    return updated;
  }
}
