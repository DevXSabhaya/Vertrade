import { Inject, Injectable, Optional } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { MarketPriceUpdatedEvent } from '@shared/events/market-price-updated.event';
import type { IOrderExecutor } from './order-executor.interface';
import { OrderRequest } from './models/order-request.model';
import { OrderModification } from './models/order-modification.model';
import { ExitRequest } from './models/exit-request.model';
import { OrderResponse } from './models/order-response.model';
import { OrderStatus } from './models/order-status.enum';
import { OrderPriceType } from './models/order-price-type.enum';
import { OrderSide } from './models/order-side.enum';
import {
  DEFAULT_PAPER_EXECUTION_CONFIG,
  type PaperExecutionConfig,
} from './models/paper-execution-config.model';
import type { PaperFillInstruction } from './paper-fill-instruction';
import { PAPER_EXECUTION_CONFIG } from './order-executor.constants';
import { OrderPlacementException } from './exceptions/order-placement.exception';
import { OrderModificationException } from './exceptions/order-modification.exception';
import { OrderCancellationException } from './exceptions/order-cancellation.exception';
import { OrderNotFoundException } from './exceptions/order-not-found.exception';

interface PaperOrderRecord {
  brokerOrderId: string;
  tradingSymbol: string;
  instrumentToken: string;
  side: OrderSide;
  quantity: number;
  status: OrderStatus;
  filledQuantity: number;
  averagePrice: number | null;
  updatedAt: Date;
  message?: string;
}

/** No further modification, cancellation, or exit is valid once an order reaches any of these. */
const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.FILLED,
  OrderStatus.CANCELLED,
  OrderStatus.REJECTED,
  OrderStatus.FAILED,
  OrderStatus.EXITED,
]);

/**
 * Fully deterministic simulator: no randomness, no timers, no hidden delays.
 * Every fill outcome is either explicitly queued by the caller (queueNextFill)
 * or derived from an explicitly-set market price (setMarketPrice) plus the
 * fixed, disclosed adjustments in `PaperExecutionConfig` (slippage/partial-
 * fill/rejection thresholds — see that model's docstring) — never guessed,
 * never random. Must satisfy the exact same contract tests as DhanExecutor.
 *
 * Every public method is declared `async` even though nothing inside ever
 * awaits anything — that's deliberate: it guarantees a synchronous throw
 * (e.g. from assertValidRequest) becomes a REJECTED PROMISE, exactly like a
 * real network-backed executor. Without `async`, a thrown error would escape
 * synchronously at the call site instead of rejecting the returned promise,
 * which would make PaperExecutor behave differently from DhanExecutor
 * under `await`/`.catch()` — breaking Liskov substitutability.
 *
 * `marketPrices` is kept current by subscribing to the same
 * `MarketPriceUpdatedEvent` the Trading Engine reacts to (constructor
 * below) — every tick the engine ever evaluates a trade against is also
 * recorded here first, so `resolveFillPrice`/`exitPosition` always have a
 * real, live price available for a MARKET order without the caller (or a
 * test) ever having to call `setMarketPrice()` manually in production.
 * `setMarketPrice()` itself remains public purely so tests can seed a price
 * deterministically without needing to publish a real event.
 */
@Injectable()
export class PaperExecutor implements IOrderExecutor {
  private readonly orders = new Map<string, PaperOrderRecord>();
  private readonly marketPrices = new Map<string, number>();
  private readonly config: PaperExecutionConfig;
  private queuedFill: PaperFillInstruction | null = null;
  private sequence = 0;

  constructor(
    @Inject(EVENT_BUS) eventBus: IEventBus,
    @Optional()
    @Inject(PAPER_EXECUTION_CONFIG)
    config?: PaperExecutionConfig,
  ) {
    this.config = config ?? DEFAULT_PAPER_EXECUTION_CONFIG;
    eventBus.subscribe<MarketPriceUpdatedEvent>(
      MarketPriceUpdatedEvent.EVENT_NAME,
      (event) => this.setMarketPrice(event.instrumentToken, event.price),
    );
  }

  setMarketPrice(instrumentToken: string, price: number): void {
    this.marketPrices.set(instrumentToken, price);
  }

  queueNextFill(instruction: PaperFillInstruction): void {
    this.queuedFill = instruction;
  }

  async placeEntryOrder(
    request: OrderRequest,
    accountId: string | null,
  ): Promise<OrderResponse> {
    // Paper trades have no broker account — accountId is part of
    // IOrderExecutor's contract but always null/unused here.
    void accountId;
    await Promise.resolve();
    this.assertValidRequest(request);

    const instruction = this.consumeQueuedFill();
    const brokerOrderId = this.nextOrderId();
    const now = new Date();

    if (instruction?.status === OrderStatus.REJECTED) {
      const record: PaperOrderRecord = {
        brokerOrderId,
        tradingSymbol: request.tradingSymbol,
        instrumentToken: request.instrumentToken,
        side: request.side,
        quantity: request.quantity,
        status: OrderStatus.REJECTED,
        filledQuantity: 0,
        averagePrice: null,
        updatedAt: now,
        message: instruction.message ?? 'Order rejected',
      };
      this.orders.set(brokerOrderId, record);
      return this.toResponse(record);
    }

    if (instruction?.status === OrderStatus.OPEN) {
      const record: PaperOrderRecord = {
        brokerOrderId,
        tradingSymbol: request.tradingSymbol,
        instrumentToken: request.instrumentToken,
        side: request.side,
        quantity: request.quantity,
        status: OrderStatus.OPEN,
        filledQuantity: 0,
        averagePrice: null,
        updatedAt: now,
      };
      this.orders.set(brokerOrderId, record);
      return this.toResponse(record);
    }

    // An explicit queueNextFill() instruction always wins (deterministic
    // test control, unchanged). Only when nothing was queued do the
    // PaperExecutionConfig thresholds below apply — every existing caller
    // that never sets a config keeps the exact pre-existing "always fills
    // in full, at the exact price, never rejected" behavior.
    if (!instruction) {
      const rejection = this.checkExchangeRejection(request);
      if (rejection) {
        const record: PaperOrderRecord = {
          brokerOrderId,
          tradingSymbol: request.tradingSymbol,
          instrumentToken: request.instrumentToken,
          side: request.side,
          quantity: request.quantity,
          status: OrderStatus.REJECTED,
          filledQuantity: 0,
          averagePrice: null,
          updatedAt: now,
          message: rejection,
        };
        this.orders.set(brokerOrderId, record);
        return this.toResponse(record);
      }
    }

    const fillPrice = this.resolveFillPrice(request, instruction);
    const requestedFillQuantity =
      instruction?.filledQuantity ?? request.quantity;
    const filledQuantity = instruction
      ? requestedFillQuantity
      : Math.min(requestedFillQuantity, this.config.maxFillQuantity);
    const status =
      instruction?.status === OrderStatus.PARTIALLY_FILLED ||
      filledQuantity < request.quantity
        ? OrderStatus.PARTIALLY_FILLED
        : OrderStatus.FILLED;

    const record: PaperOrderRecord = {
      brokerOrderId,
      tradingSymbol: request.tradingSymbol,
      instrumentToken: request.instrumentToken,
      side: request.side,
      quantity: request.quantity,
      status,
      filledQuantity,
      averagePrice: fillPrice,
      updatedAt: now,
    };
    this.orders.set(brokerOrderId, record);
    return this.toResponse(record);
  }

  async modifyOrder(
    brokerOrderId: string,
    changes: OrderModification,
    accountId: string | null,
  ): Promise<OrderResponse> {
    void accountId;
    await Promise.resolve();
    const record = this.requireOrder(brokerOrderId);

    if (TERMINAL_STATUSES.has(record.status)) {
      throw new OrderModificationException(
        `Order ${brokerOrderId} cannot be modified: it is already ${record.status}`,
      );
    }

    if (changes.quantity !== undefined) {
      if (changes.quantity <= 0) {
        throw new OrderModificationException(
          'Modified quantity must be positive',
        );
      }
      record.quantity = changes.quantity;
    }
    if (changes.price !== undefined) {
      record.averagePrice = record.averagePrice ?? null;
    }
    record.updatedAt = new Date();

    return this.toResponse(record);
  }

  async cancelOrder(
    brokerOrderId: string,
    accountId: string | null,
  ): Promise<OrderResponse> {
    void accountId;
    await Promise.resolve();
    const record = this.requireOrder(brokerOrderId);

    if (TERMINAL_STATUSES.has(record.status)) {
      throw new OrderCancellationException(
        `Order ${brokerOrderId} cannot be cancelled: it is already ${record.status}`,
      );
    }

    record.status = OrderStatus.CANCELLED;
    record.updatedAt = new Date();
    return this.toResponse(record);
  }

  async exitPosition(
    brokerOrderId: string,
    request: ExitRequest,
    accountId: string | null,
  ): Promise<OrderResponse> {
    void accountId;
    await Promise.resolve();
    const original = this.requireOrder(brokerOrderId);

    if (
      original.status !== OrderStatus.FILLED &&
      original.status !== OrderStatus.PARTIALLY_FILLED
    ) {
      throw new OrderPlacementException(
        `Cannot exit order ${brokerOrderId}: it has no filled quantity (status ${original.status})`,
      );
    }
    if (request.quantity <= 0 || request.quantity > original.filledQuantity) {
      throw new OrderPlacementException(
        `Exit quantity ${request.quantity} is invalid for order ${brokerOrderId} (filled: ${original.filledQuantity})`,
      );
    }

    const instruction = this.consumeQueuedFill();
    const exitPrice =
      instruction?.fillPrice ??
      request.price ??
      this.marketPrices.get(original.instrumentToken);
    if (exitPrice === undefined) {
      throw new OrderPlacementException(
        `No exit price available for ${original.tradingSymbol}: call setMarketPrice() or supply an explicit price`,
      );
    }

    const exitOrderId = this.nextOrderId();
    const now = new Date();
    const exitRecord: PaperOrderRecord = {
      brokerOrderId: exitOrderId,
      tradingSymbol: original.tradingSymbol,
      instrumentToken: original.instrumentToken,
      side: original.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY,
      quantity: request.quantity,
      status: OrderStatus.FILLED,
      filledQuantity: request.quantity,
      averagePrice: exitPrice,
      updatedAt: now,
    };
    this.orders.set(exitOrderId, exitRecord);

    original.status = OrderStatus.EXITED;
    original.updatedAt = now;

    return this.toResponse(exitRecord);
  }

  async getOrderStatus(
    brokerOrderId: string,
    accountId: string | null,
  ): Promise<OrderResponse> {
    void accountId;
    await Promise.resolve();
    const record = this.requireOrder(brokerOrderId);
    return this.toResponse(record);
  }

  private consumeQueuedFill(): PaperFillInstruction | null {
    const instruction = this.queuedFill;
    this.queuedFill = null;
    return instruction;
  }

  private resolveFillPrice(
    request: OrderRequest,
    instruction: PaperFillInstruction | null,
  ): number {
    if (instruction?.fillPrice !== undefined) {
      return instruction.fillPrice;
    }
    // LIMIT and SL both guarantee their specified price, exactly like a
    // real broker — never worse. MARKET and SL_M fill at the prevailing
    // market price, subject to slippage (see applySlippage).
    if (
      (request.priceType === OrderPriceType.LIMIT ||
        request.priceType === OrderPriceType.SL) &&
      request.price !== undefined
    ) {
      return request.price;
    }
    const marketPrice = this.marketPrices.get(request.instrumentToken);
    if (marketPrice === undefined) {
      throw new OrderPlacementException(
        `No market price available for instrument ${request.instrumentToken}. Call setMarketPrice() before placing a MARKET/SL_M order.`,
      );
    }
    return this.applySlippage(marketPrice, request.side);
  }

  /** Deterministic, disclosed adjustment against the real market price — never random. A BUY fills slightly worse (higher); a SELL fills slightly worse (lower). Zero (the default) leaves the market price untouched. */
  private applySlippage(marketPrice: number, side: OrderSide): number {
    if (this.config.slippageBps === 0) {
      return marketPrice;
    }
    const adjustment = (marketPrice * this.config.slippageBps) / 10_000;
    return side === OrderSide.BUY
      ? marketPrice + adjustment
      : marketPrice - adjustment;
  }

  /** Two realistic, deterministic rejection reasons — both opt-in via PaperExecutionConfig thresholds, both derived from the real request/market price, never randomly triggered. */
  private checkExchangeRejection(request: OrderRequest): string | null {
    if (request.quantity > this.config.maxOrderQuantity) {
      return `Order quantity ${request.quantity} exceeds the exchange-permitted maximum of ${this.config.maxOrderQuantity}`;
    }

    const isPriceBound =
      request.priceType === OrderPriceType.LIMIT ||
      request.priceType === OrderPriceType.SL;
    if (
      isPriceBound &&
      request.price !== undefined &&
      Number.isFinite(this.config.priceBandPercent)
    ) {
      const marketPrice = this.marketPrices.get(request.instrumentToken);
      if (marketPrice !== undefined) {
        const deviationPercent =
          (Math.abs(request.price - marketPrice) / marketPrice) * 100;
        if (deviationPercent > this.config.priceBandPercent) {
          return `Order price ${request.price} is outside the exchange price band (market: ${marketPrice}, allowed deviation: ${this.config.priceBandPercent}%)`;
        }
      }
    }

    return null;
  }

  private assertValidRequest(request: OrderRequest): void {
    if (request.quantity <= 0) {
      throw new OrderPlacementException('Order quantity must be positive');
    }
    if (
      request.priceType === OrderPriceType.LIMIT &&
      request.price === undefined
    ) {
      throw new OrderPlacementException('A LIMIT order requires a price');
    }
    if (
      (request.priceType === OrderPriceType.SL ||
        request.priceType === OrderPriceType.SL_M) &&
      request.triggerPrice === undefined
    ) {
      throw new OrderPlacementException(
        `A ${request.priceType} order requires a triggerPrice`,
      );
    }
    if (
      request.priceType === OrderPriceType.SL &&
      request.price === undefined
    ) {
      throw new OrderPlacementException('An SL order requires a price');
    }
  }

  private requireOrder(brokerOrderId: string): PaperOrderRecord {
    const record = this.orders.get(brokerOrderId);
    if (!record) {
      throw new OrderNotFoundException(
        `No paper order found with id ${brokerOrderId}`,
      );
    }
    return record;
  }

  private nextOrderId(): string {
    this.sequence += 1;
    return `PAPER-${this.sequence.toString().padStart(6, '0')}`;
  }

  private toResponse(record: PaperOrderRecord): OrderResponse {
    return new OrderResponse(
      record.brokerOrderId,
      record.status,
      record.filledQuantity,
      record.averagePrice,
      record.updatedAt,
      record.message,
    );
  }
}
