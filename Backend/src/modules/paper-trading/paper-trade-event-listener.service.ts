import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { OrderSubmittedEvent } from '@modules/order-queue/events/order-submitted.event';
import { OrderFailedEvent } from '@modules/order-queue/events/order-failed.event';
import { TradeCompletedEvent } from '@modules/trading-engine/events/trade-completed.event';
import { PaperAccountService } from '@modules/paper-account/paper-account.service';
import { TradeExtensionStore } from '@modules/trade-lifecycle/trade-extension.store';
import { PaperTradeOwnershipService } from './paper-trade-ownership.service';
import { PaperTradeStatus } from './models/paper-trade-status.enum';

/**
 * Bridges the existing, unmodified Order Queue / Trading Engine event stream
 * into this module's per-user ownership ledger (Phase 12, Part 4/11) — the
 * only place a paper trade's `PENDING -> OPEN`, `PENDING -> FAILED`, and
 * `OPEN -> CLOSED` transitions happen. Never calls into the trading pipeline
 * itself, only reacts to events it already publishes.
 */
@Injectable()
export class PaperTradeEventListener implements OnModuleInit {
  private readonly logger = new Logger(PaperTradeEventListener.name);

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly ownershipService: PaperTradeOwnershipService,
    private readonly paperAccountService: PaperAccountService,
    private readonly tradeExtensionStore: TradeExtensionStore,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<OrderSubmittedEvent>(
      OrderSubmittedEvent.EVENT_NAME,
      (event) => {
        void this.onOrderSubmitted(event);
      },
    );
    this.eventBus.subscribe<OrderFailedEvent>(
      OrderFailedEvent.EVENT_NAME,
      (event) => {
        void this.onOrderFailed(event);
      },
    );
    this.eventBus.subscribe<TradeCompletedEvent>(
      TradeCompletedEvent.EVENT_NAME,
      (event) => {
        void this.onTradeCompleted(event);
      },
    );
  }

  private async onOrderSubmitted(event: OrderSubmittedEvent): Promise<void> {
    const ownership = await this.ownershipService.findByQueueItemId(
      event.queueItemId,
    );
    if (!ownership || ownership.status !== PaperTradeStatus.PENDING) {
      return;
    }
    await this.ownershipService.markOpen(ownership, event.tradeId);

    if (ownership.trailingConfig) {
      // Applied here, not at trade-creation time, because the underlying
      // Trading Engine tradeId doesn't exist until this exact moment —
      // `TradeExtensionStore` is the same primitive
      // TrailingManager/TargetManager already read from every tick.
      await this.tradeExtensionStore.patch(event.tradeId, {
        trailingEnabled: true,
        trailingConfig: ownership.trailingConfig,
      });
    }
  }

  private async onOrderFailed(event: OrderFailedEvent): Promise<void> {
    const ownership = await this.ownershipService.findByQueueItemId(
      event.queueItemId,
    );
    if (!ownership || ownership.status !== PaperTradeStatus.PENDING) {
      return;
    }
    await this.ownershipService.markFailed(ownership, event.reason);
    try {
      await this.paperAccountService.rollbackReservation(
        ownership.userId,
        ownership.reservedAmount,
      );
    } catch (error) {
      this.logger.error(
        `Failed to roll back reservation for paper trade ${ownership.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  private async onTradeCompleted(event: TradeCompletedEvent): Promise<void> {
    const ownership = await this.ownershipService.findByTradeId(event.tradeId);
    if (!ownership || ownership.status !== PaperTradeStatus.OPEN) {
      return;
    }
    await this.ownershipService.markClosed(ownership);
    try {
      await this.paperAccountService.settleTrade(
        ownership.userId,
        ownership.reservedAmount,
        event.realizedPnl,
      );
    } catch (error) {
      this.logger.error(
        `Failed to settle paper trade ${ownership.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
