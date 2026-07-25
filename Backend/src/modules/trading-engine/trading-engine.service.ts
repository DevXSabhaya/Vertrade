import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { ORDER_EXECUTOR } from '@modules/broker/executors/order-executor.constants';
import type { IOrderExecutor } from '@modules/broker/executors/order-executor.interface';
import { OrderRequest } from '@modules/broker/executors/models/order-request.model';
import { ExitRequest } from '@modules/broker/executors/models/exit-request.model';
import { OrderSide } from '@modules/broker/executors/models/order-side.enum';
import { OrderPriceType } from '@modules/broker/executors/models/order-price-type.enum';
import type { OrderResponse } from '@modules/broker/executors/models/order-response.model';
import { Trade } from './domain/trade.aggregate';
import { TradeDirection } from './domain/trade-direction.enum';
import { TradeState } from './domain/trade-state.enum';
import type { CreateTradeParams } from './domain/create-trade.params';
import type { TradeSnapshot } from './domain/trade-snapshot';
import { MarketPriceUpdatedEvent } from './events/market-price-updated.event';
import { TradeNotFoundException } from './exceptions/trade-not-found.exception';
import { InvalidExitRequestException } from './exceptions/invalid-exit-request.exception';

/**
 * Pure domain orchestrator: creates and holds Trade aggregates in memory,
 * feeds them price updates, and translates their decisions into
 * IOrderExecutor calls — nothing else. No persistence, no HTTP, no
 * knowledge of which broker (or Paper) is behind IOrderExecutor.
 */
@Injectable()
export class TradingEngineService {
  private readonly trades = new Map<string, Trade>();

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(ORDER_EXECUTOR) private readonly orderExecutor: IOrderExecutor,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {
    this.eventBus.subscribe<MarketPriceUpdatedEvent>(
      MarketPriceUpdatedEvent.EVENT_NAME,
      (event) =>
        this.handleMarketPriceUpdate(event.instrumentToken, event.price),
    );
  }

  createTrade(params: CreateTradeParams): TradeSnapshot {
    const trade = Trade.create(params, this.clock);
    trade.arm(this.clock);
    this.trades.set(trade.id, trade);
    this.publishDomainEvents(trade);
    return trade.toSnapshot();
  }

  getTrade(tradeId: string): TradeSnapshot {
    return this.requireTrade(tradeId).toSnapshot();
  }

  getAllTrades(): TradeSnapshot[] {
    return Array.from(this.trades.values(), (trade) => trade.toSnapshot());
  }

  hasTrade(tradeId: string): boolean {
    return this.trades.has(tradeId);
  }

  /**
   * Rehydrates a previously persisted Trade back into the in-memory map
   * (Phase 9 — Startup Recovery). Idempotent: rehydrating a trade that is
   * already present (e.g. a recovery run retried after a partial failure)
   * is a silent no-op rather than clobbering live in-memory state with a
   * possibly-stale snapshot. Never queues/publishes any event itself — the
   * trade's own lifecycle events already fired in the process that recorded
   * this snapshot; the Recovery module publishes its own TradeRecoveredEvent
   * once rehydration completes.
   */
  restoreTrade(snapshot: TradeSnapshot): void {
    if (this.trades.has(snapshot.id)) {
      return;
    }
    this.trades.set(snapshot.id, Trade.fromSnapshot(snapshot));
  }

  /**
   * Applies a broker order response that was already confirmed by the
   * broker but never recorded locally (the process crashed between the
   * broker's response and the in-memory state update). Reuses the exact
   * same Trade command the live tick-processing path uses
   * (`applyEntryOrderResponse`/`applyExitOrderResponse`) — Phase 9's
   * Position Reconciliation auto-repair path is this method's only caller,
   * and only for the single safe case described above; it never places a
   * new order and never touches a trade the broker hasn't already resolved.
   */
  applyRecoveredOrderResponse(
    tradeId: string,
    leg: 'ENTRY' | 'EXIT',
    response: OrderResponse,
  ): TradeSnapshot {
    const trade = this.requireTrade(tradeId);
    if (leg === 'ENTRY') {
      trade.applyEntryOrderResponse(response, this.clock);
    } else {
      trade.applyExitOrderResponse(response, this.clock);
    }
    this.publishDomainEvents(trade);
    return trade.toSnapshot();
  }

  async cancelTrade(tradeId: string, reason: string): Promise<TradeSnapshot> {
    const trade = this.requireTrade(tradeId);

    if (trade.state === TradeState.ENTRY_PENDING && trade.entryOrderId) {
      try {
        await this.orderExecutor.cancelOrder(trade.entryOrderId);
      } catch (error) {
        trade.markFailed(this.reasonOf(error), this.clock);
        this.publishDomainEvents(trade);
        return trade.toSnapshot();
      }
    }

    trade.cancel(reason, this.clock);
    this.publishDomainEvents(trade);
    return trade.toSnapshot();
  }

  enterRecovery(tradeId: string, reason: string): TradeSnapshot {
    const trade = this.requireTrade(tradeId);
    trade.enterRecovery(reason, this.clock);
    this.publishDomainEvents(trade);
    return trade.toSnapshot();
  }

  resumeFromRecovery(tradeId: string): TradeSnapshot {
    const trade = this.requireTrade(tradeId);
    trade.resumeFromRecovery(this.clock);
    this.publishDomainEvents(trade);
    return trade.toSnapshot();
  }

  /**
   * Applies a caller-computed stop-loss value (Phase 10's configurable
   * Trailing Stop Engine) instead of the aggregate's own default
   * per-target trailing rule. A no-op (throws nothing, changes nothing) if
   * the trade isn't ACTIVE or the proposed value would move the stop loss
   * backward — see `Trade.moveStopLoss()` for the exact rule.
   */
  updateTrailingStopLoss(tradeId: string, newStopLoss: number): TradeSnapshot {
    const trade = this.requireTrade(tradeId);
    trade.moveStopLoss(newStopLoss, this.clock);
    this.publishDomainEvents(trade);
    return trade.toSnapshot();
  }

  /**
   * Exits part of an open position at a caller-supplied quantity — Phase
   * 10's Target Engine calls this to book profit at each target instead of
   * only trailing the stop loss. Reuses the exact same executor call and
   * `Trade.applyExitOrderResponse()` command the tick-driven stop-loss exit
   * path already uses (`attemptExit` below), just parameterized by
   * quantity — `Trade` already correctly keeps the trade ACTIVE and awaiting
   * the remainder when the exited quantity is less than the full open
   * quantity, so a partial exit here needs no new aggregate-level logic.
   */
  async requestPartialExit(
    tradeId: string,
    quantity: number,
    markPrice: number,
  ): Promise<TradeSnapshot> {
    const trade = this.requireTrade(tradeId);
    this.assertExitable(trade, quantity);
    await this.attemptExit(trade, markPrice, quantity);
    this.publishDomainEvents(trade);
    return trade.toSnapshot();
  }

  /**
   * Exits the entire remaining open quantity — the Exit Manager's entry
   * point for every exit reason other than the tick-driven stop-loss exit
   * (manual, force, market-close, broker-disconnect, emergency).
   */
  async requestFullExit(
    tradeId: string,
    markPrice: number,
  ): Promise<TradeSnapshot> {
    const trade = this.requireTrade(tradeId);
    this.assertExitable(trade, trade.openQuantity);
    await this.attemptExit(trade, markPrice, trade.openQuantity);
    this.publishDomainEvents(trade);
    return trade.toSnapshot();
  }

  /**
   * The Engine's single price-input entry point. Evaluates every trade
   * watching this instrument, sequentially (never in parallel — two trades on
   * the same instrument must never race each other's executor calls).
   */
  async handleMarketPriceUpdate(
    instrumentToken: string,
    price: number,
  ): Promise<void> {
    const matching = Array.from(this.trades.values()).filter(
      (trade) => trade.instrumentToken === instrumentToken,
    );

    for (const trade of matching) {
      await this.evaluateTrade(trade, price);
    }
  }

  private async evaluateTrade(trade: Trade, price: number): Promise<void> {
    if (trade.state === TradeState.WAITING_ENTRY) {
      await this.evaluateEntry(trade, price);
    } else if (trade.state === TradeState.ACTIVE && !trade.isAwaitingExit) {
      this.evaluateActive(trade, price);
    }

    if (trade.state === TradeState.ACTIVE && trade.isAwaitingExit) {
      await this.attemptExit(trade, price, trade.openQuantity);
    }

    this.publishDomainEvents(trade);
  }

  private async evaluateEntry(trade: Trade, price: number): Promise<void> {
    // `isMarketOrder` (set via CreatePaperTradeDto -> TradeValidationRequest
    // .metadata, the same generic pass-through every trade already carries)
    // fires entry on the very next tick unconditionally — a genuine market
    // order — instead of gating on `hasCrossedEntry`, which is for
    // triggered/conditional entries. Absent or false: unchanged behavior.
    const isMarketOrder = trade.metadata.isMarketOrder === true;
    if (!isMarketOrder && !trade.hasCrossedEntry(price)) {
      return;
    }

    trade.triggerEntry(price, this.clock);
    this.publishDomainEvents(trade);

    let response: OrderResponse;
    try {
      response = await this.orderExecutor.placeEntryOrder(
        this.buildEntryOrderRequest(trade),
      );
    } catch (error) {
      trade.markEntryOrderFailed(this.reasonOf(error), this.clock);
      return;
    }
    trade.applyEntryOrderResponse(response, this.clock);
  }

  private evaluateActive(trade: Trade, price: number): void {
    trade.advancePrice(price, this.clock);
  }

  private async attemptExit(
    trade: Trade,
    price: number,
    quantity: number,
  ): Promise<void> {
    trade.beginExitAttempt();
    let response: OrderResponse;
    try {
      response = await this.orderExecutor.exitPosition(
        trade.entryOrderId as string,
        new ExitRequest(quantity, price),
      );
    } catch {
      trade.markExitAttemptFailed();
      return;
    }
    trade.applyExitOrderResponse(response, this.clock);
  }

  /** Only a live, filled position can be exited, and only for a quantity that's actually still open. */
  private assertExitable(trade: Trade, quantity: number): void {
    if (trade.state !== TradeState.ACTIVE) {
      throw new InvalidExitRequestException(
        `Trade ${trade.id} cannot be exited while in state ${trade.state}`,
      );
    }
    if (quantity <= 0 || quantity > trade.openQuantity) {
      throw new InvalidExitRequestException(
        `Requested exit quantity ${quantity} is invalid for trade ${trade.id} (open quantity ${trade.openQuantity})`,
      );
    }
  }

  private buildEntryOrderRequest(trade: Trade): OrderRequest {
    return new OrderRequest(
      trade.exchange,
      trade.tradingSymbol,
      trade.instrumentToken,
      trade.direction === TradeDirection.LONG ? OrderSide.BUY : OrderSide.SELL,
      trade.quantity,
      OrderPriceType.MARKET,
    );
  }

  private publishDomainEvents(trade: Trade): void {
    for (const event of trade.pullDomainEvents()) {
      this.eventBus.publish(event);
    }
  }

  private requireTrade(tradeId: string): Trade {
    const trade = this.trades.get(tradeId);
    if (!trade) {
      throw new TradeNotFoundException(`No trade found with id ${tradeId}`);
    }
    return trade;
  }

  private reasonOf(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
