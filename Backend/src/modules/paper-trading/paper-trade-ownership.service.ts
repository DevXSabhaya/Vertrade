import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import type { TrailingConfiguration } from '@modules/trade-lifecycle/models/trailing-configuration.model';
import { PAPER_TRADE_OWNERSHIP_REPOSITORY } from './paper-trading.constants';
import type { IPaperTradeOwnershipRepository } from './interfaces/paper-trade-ownership-repository.interface';
import type { PaperTradeOwnership } from './models/paper-trade-ownership.model';
import { PaperTradeStatus } from './models/paper-trade-status.enum';
import { PaperTradeNotFoundException } from './exceptions/paper-trade-not-found.exception';

const OPEN_STATUSES: readonly PaperTradeStatus[] = [
  PaperTradeStatus.PENDING,
  PaperTradeStatus.OPEN,
];

/**
 * Owns the `PaperTradeOwnership` ledger — the mapping from `userId` to the
 * trades it submitted (Phase 12, Part 5). Every user-scoped query in this
 * module goes through here first; nothing in `TradingEngineModule`/
 * `TradeLifecycleModule` is ever asked to filter by user, because those
 * aggregates have no such field.
 */
@Injectable()
export class PaperTradeOwnershipService {
  constructor(
    @Inject(PAPER_TRADE_OWNERSHIP_REPOSITORY)
    private readonly repository: IPaperTradeOwnershipRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async create(params: {
    userId: string;
    idempotencyKey: string;
    queueItemId: string;
    reservedAmount: number;
    rawSymbol: string;
    direction: TradeDirection;
    quantity: number;
    entryTriggerPrice: number;
    initialStopLoss: number;
    isMarketOrder?: boolean;
    trailingConfig?: TrailingConfiguration | null;
  }): Promise<PaperTradeOwnership> {
    const now = this.clock.now().toISOString();
    const ownership: PaperTradeOwnership = {
      id: randomUUID(),
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
      queueItemId: params.queueItemId,
      tradeId: null,
      status: PaperTradeStatus.PENDING,
      reservedAmount: params.reservedAmount,
      rawSymbol: params.rawSymbol,
      direction: params.direction,
      quantity: params.quantity,
      entryTriggerPrice: params.entryTriggerPrice,
      initialStopLoss: params.initialStopLoss,
      isMarketOrder: params.isMarketOrder ?? false,
      trailingConfig: params.trailingConfig ?? null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.save(ownership);
    return ownership;
  }

  async findByQueueItemId(
    queueItemId: string,
  ): Promise<PaperTradeOwnership | null> {
    return this.repository.findByQueueItemId(queueItemId);
  }

  async findByTradeId(tradeId: string): Promise<PaperTradeOwnership | null> {
    return this.repository.findByTradeId(tradeId);
  }

  /** Throws {@link PaperTradeNotFoundException} both when the id doesn't exist and when it belongs to a different user — a caller can never distinguish "not found" from "not yours". */
  async requireOwned(id: string, userId: string): Promise<PaperTradeOwnership> {
    const ownership = await this.repository.findById(id);
    if (!ownership || ownership.userId !== userId) {
      throw new PaperTradeNotFoundException(
        `No paper trade found with id ${id}`,
      );
    }
    return ownership;
  }

  async listByUser(
    userId: string,
    limit = 100,
  ): Promise<PaperTradeOwnership[]> {
    return this.repository.listByUser(userId, limit);
  }

  async countOpenForUser(userId: string): Promise<number> {
    return this.repository.countByUserAndStatuses(userId, OPEN_STATUSES);
  }

  async markOpen(
    ownership: PaperTradeOwnership,
    tradeId: string,
  ): Promise<void> {
    await this.repository.save({
      ...ownership,
      tradeId,
      status: PaperTradeStatus.OPEN,
      updatedAt: this.clock.now().toISOString(),
    });
  }

  async markFailed(
    ownership: PaperTradeOwnership,
    reason: string,
  ): Promise<void> {
    await this.repository.save({
      ...ownership,
      status: PaperTradeStatus.FAILED,
      failureReason: reason,
      updatedAt: this.clock.now().toISOString(),
    });
  }

  async markCancelled(ownership: PaperTradeOwnership): Promise<void> {
    await this.repository.save({
      ...ownership,
      status: PaperTradeStatus.CANCELLED,
      updatedAt: this.clock.now().toISOString(),
    });
  }

  async markClosed(ownership: PaperTradeOwnership): Promise<void> {
    await this.repository.save({
      ...ownership,
      status: PaperTradeStatus.CLOSED,
      updatedAt: this.clock.now().toISOString(),
    });
  }
}
