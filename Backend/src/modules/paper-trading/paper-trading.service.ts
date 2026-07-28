import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { OrderQueueService } from '@modules/order-queue/order-queue.service';
import type { TradeValidationRequest } from '@modules/trade-validation/models/trade-validation-request.model';
import type { QueueItemSnapshot } from '@modules/order-queue/models/queue-item-snapshot';
import { TradeManager } from '@modules/trade-lifecycle/trade-manager.service';
import type { TradeRecord } from '@modules/trade-lifecycle/models/trade-record.model';
import { PaperAccountService } from '@modules/paper-account/paper-account.service';
import type { PaperAccountSummary } from '@modules/paper-account/models/paper-account.model';
import type { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { PaperTradeOwnershipService } from './paper-trade-ownership.service';
import type { PaperTradeOwnership } from './models/paper-trade-ownership.model';
import { PaperTradeStatus } from './models/paper-trade-status.enum';
import type { PaperTradeView } from './models/paper-trade-view.model';
import type { CreatePaperTradeDto } from './dto/create-paper-trade.dto';
import { PaperTradeCreatedEvent } from './events/paper-trade-created.event';
import { PaperTradeExitedEvent } from './events/paper-trade-exited.event';
import { PaperTradeSubmissionRejectedException } from './exceptions/paper-trade-submission-rejected.exception';
import { PaperTradeNotActionableException } from './exceptions/paper-trade-not-actionable.exception';

export interface PnlSummary extends PaperAccountSummary {
  readonly unrealizedPnl: number;
  readonly totalPnl: number;
}

export interface TradeHistoryFilters {
  readonly status?: PaperTradeStatus;
  readonly side?: TradeDirection;
  /** Case-insensitive substring match against the ownership row's rawSymbol. */
  readonly instrument?: string;
  /** Inclusive ISO-8601 lower bound compared against createdAt. */
  readonly dateFrom?: string;
  /** Inclusive ISO-8601 upper bound compared against createdAt. */
  readonly dateTo?: string;
}

/**
 * The Phase 12 product-API orchestrator. Every write here does nothing but
 * call already-existing Phase 3-11 services in sequence — `OrderQueueService`
 * (the one and only entrypoint into Validation -> Risk -> Engine -> Executor,
 * per Phase 7/11's own docstrings), `TradeManager`/`PositionManager` for
 * reads, and `PaperAccountService` for the virtual-balance ledger. It never
 * creates a trade record directly, never reaches into the Trading Engine's
 * in-memory map, and never bypasses risk management.
 */
@Injectable()
export class PaperTradingService {
  constructor(
    private readonly orderQueueService: OrderQueueService,
    private readonly tradeManager: TradeManager,
    private readonly ownershipService: PaperTradeOwnershipService,
    private readonly paperAccountService: PaperAccountService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async createTrade(
    userId: string,
    dto: CreatePaperTradeDto,
  ): Promise<PaperTradeView> {
    const reservedAmount = dto.quantity * dto.entryTriggerPrice;
    // Account-level gate (Part 6): reserved *before* the trade even attempts
    // to enter the pipeline, so a user can never commit more virtual capital
    // than they have — independent of, and in addition to, the global
    // Risk Management capital checks the pipeline still runs regardless.
    await this.paperAccountService.reserveMargin(userId, reservedAmount);

    // A fresh key per HTTP call, scoped by userId, so two different users
    // submitting an identical-looking trade in the same instant can never
    // collide onto the same queue item — `IdempotencyKeyGenerator`'s own
    // derived-key fallback has no userId dimension.
    const idempotencyKey = `paper:${userId}:${randomUUID()}`;
    const request: TradeValidationRequest = {
      rawSymbol: dto.rawSymbol,
      direction: dto.direction,
      quantity: dto.quantity,
      entryTriggerPrice: dto.entryTriggerPrice,
      initialStopLoss: dto.initialStopLoss,
      targets: dto.targets,
      idempotencyKey,
      // `isMarketOrder` rides through to `Trade.metadata` via the existing
      // order-queue -> engine pipeline (never a bespoke field on
      // TradeValidationRequest/CreateTradeParams) — TradingEngineService
      // reads it to fire the entry on the very next tick instead of
      // waiting for price to cross entryTriggerPrice. See
      // `TradingEngineService.evaluateEntry`.
      metadata: {
        userId,
        source: 'paper-trading-api',
        isMarketOrder: dto.isMarketOrder ?? false,
        // Read by LiveOrderSafetyGateService via AngelOneExecutor — never
        // read by PaperExecutor, so this has no effect at all in PAPER mode.
        liveTradingConfirmed: dto.liveTradingConfirmed ?? false,
      },
    };

    const result = await this.orderQueueService.submitTrade(request, userId);

    if (result.outcome === 'VALIDATION_FAILED') {
      await this.paperAccountService.rollbackReservation(
        userId,
        reservedAmount,
      );
      throw new PaperTradeSubmissionRejectedException(result.failure.message);
    }
    if (result.outcome === 'QUEUE_FULL') {
      await this.paperAccountService.rollbackReservation(
        userId,
        reservedAmount,
      );
      throw new PaperTradeSubmissionRejectedException(
        'The order queue is currently full — please try again shortly',
      );
    }
    if (result.outcome === 'REJECTED_KILL_SWITCH') {
      await this.paperAccountService.rollbackReservation(
        userId,
        reservedAmount,
      );
      throw new PaperTradeSubmissionRejectedException(
        'Trading is currently halted (kill switch engaged)',
      );
    }
    if (result.outcome === 'DUPLICATE') {
      const existing = await this.ownershipService.findByQueueItemId(
        result.item.id,
      );
      if (existing && existing.userId === userId) {
        return this.toView(existing, null);
      }
      // The idempotency key is generated fresh per call, so this should be
      // unreachable in practice; fail safe rather than silently attach this
      // submission to whatever the collided item belongs to.
      await this.paperAccountService.rollbackReservation(
        userId,
        reservedAmount,
      );
      throw new PaperTradeSubmissionRejectedException(
        'Duplicate trade submission detected',
      );
    }

    const ownership = await this.ownershipService.create({
      userId,
      idempotencyKey: result.item.idempotencyKey,
      queueItemId: result.item.id,
      reservedAmount,
      rawSymbol: dto.rawSymbol,
      direction: dto.direction,
      quantity: dto.quantity,
      entryTriggerPrice: dto.entryTriggerPrice,
      initialStopLoss: dto.initialStopLoss,
      isMarketOrder: dto.isMarketOrder,
      trailingConfig: dto.trailingConfig ?? null,
    });
    this.eventBus.publish(
      new PaperTradeCreatedEvent(userId, ownership.id, dto.rawSymbol),
    );
    return this.toView(ownership, null);
  }

  async cancelTrade(userId: string, id: string): Promise<PaperTradeView> {
    const ownership = await this.ownershipService.requireOwned(id, userId);
    if (ownership.status !== PaperTradeStatus.PENDING) {
      throw new PaperTradeNotActionableException(
        `Paper trade ${id} cannot be cancelled from status ${ownership.status}`,
      );
    }

    try {
      await this.orderQueueService.cancel(
        ownership.idempotencyKey,
        'Cancelled by user',
      );
    } catch (error) {
      throw new PaperTradeNotActionableException(
        `Paper trade ${id} could not be cancelled: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    await this.ownershipService.markCancelled(ownership);
    await this.paperAccountService.rollbackReservation(
      userId,
      ownership.reservedAmount,
    );
    return this.toView(
      { ...ownership, status: PaperTradeStatus.CANCELLED },
      null,
    );
  }

  async exitTrade(userId: string, id: string): Promise<PaperTradeView> {
    const ownership = await this.ownershipService.requireOwned(id, userId);
    if (ownership.status !== PaperTradeStatus.OPEN || !ownership.tradeId) {
      throw new PaperTradeNotActionableException(
        `Paper trade ${id} cannot be exited from status ${ownership.status}`,
      );
    }

    const record = await this.tradeManager.manualExit(ownership.tradeId);
    this.eventBus.publish(
      new PaperTradeExitedEvent(userId, ownership.id, ownership.tradeId),
    );
    // Margin release + realized P&L settlement happens asynchronously via
    // `PaperTradeEventListener` reacting to `TradeCompletedEvent`, exactly
    // like every other post-completion side effect in this codebase.
    return this.toView(ownership, record);
  }

  async getTrade(userId: string, id: string): Promise<PaperTradeView> {
    const ownership = await this.ownershipService.requireOwned(id, userId);
    const record = ownership.tradeId
      ? await this.tradeManager.getTrade(ownership.tradeId).catch(() => null)
      : null;
    return this.toView(ownership, record);
  }

  async getActiveTrades(userId: string): Promise<PaperTradeView[]> {
    const ownerships = await this.ownershipService.listByUser(userId);
    const open = ownerships.filter(
      (o) => o.status === PaperTradeStatus.OPEN && o.tradeId,
    );
    return Promise.all(
      open.map(async (o) => {
        const record = await this.tradeManager
          .getTrade(o.tradeId as string)
          .catch(() => null);
        return this.toView(o, record);
      }),
    );
  }

  async getHistory(
    userId: string,
    limit = 50,
    offset = 0,
    filters: TradeHistoryFilters = {},
  ): Promise<PaperTradeView[]> {
    const ownerships = await this.ownershipService.listByUser(userId, 500);
    const filtered = ownerships.filter((o) => {
      if (o.status === PaperTradeStatus.PENDING) return false;
      if (filters.status && o.status !== filters.status) return false;
      if (filters.side && o.direction !== filters.side) return false;
      if (
        filters.instrument &&
        !o.rawSymbol.toUpperCase().includes(filters.instrument.toUpperCase())
      ) {
        return false;
      }
      if (filters.dateFrom && o.createdAt < filters.dateFrom) return false;
      if (filters.dateTo && o.createdAt > filters.dateTo) return false;
      return true;
    });
    const page = filtered.slice(offset, offset + limit);
    return Promise.all(
      page.map(async (o) => {
        const record = o.tradeId
          ? await this.tradeManager.getTrade(o.tradeId).catch(() => null)
          : null;
        return this.toView(o, record);
      }),
    );
  }

  async getOrders(userId: string): Promise<QueueItemSnapshot[]> {
    const ownerships = await this.ownershipService.listByUser(userId, 500);
    const items: QueueItemSnapshot[] = [];
    for (const ownership of ownerships) {
      try {
        items.push(this.orderQueueService.getItem(ownership.idempotencyKey));
      } catch {
        // The queue item aged out of the in-memory map — the ownership row
        // itself remains the durable record of what happened.
      }
    }
    return items;
  }

  async getPnlSummary(userId: string): Promise<PnlSummary> {
    const [summary, activeTrades] = await Promise.all([
      this.paperAccountService.getSummary(userId),
      this.getActiveTrades(userId),
    ]);
    const unrealizedPnl = activeTrades.reduce(
      (sum, view) => sum + (view.trade?.unrealizedPnl ?? 0),
      0,
    );
    return {
      ...summary,
      unrealizedPnl,
      totalPnl: summary.realizedPnl + unrealizedPnl,
    };
  }

  async hasOpenTrades(userId: string): Promise<boolean> {
    return (await this.ownershipService.countOpenForUser(userId)) > 0;
  }

  private toView(
    ownership: PaperTradeOwnership,
    record: TradeRecord | null,
  ): PaperTradeView {
    return {
      id: ownership.id,
      status: ownership.status,
      tradeId: ownership.tradeId,
      rawSymbol: ownership.rawSymbol,
      direction: ownership.direction,
      quantity: ownership.quantity,
      entryTriggerPrice: ownership.entryTriggerPrice,
      initialStopLoss: ownership.initialStopLoss,
      isMarketOrder: ownership.isMarketOrder,
      trailingConfig: ownership.trailingConfig,
      reservedAmount: ownership.reservedAmount,
      failureReason: ownership.failureReason,
      createdAt: ownership.createdAt,
      updatedAt: ownership.updatedAt,
      trade: record,
    };
  }
}
