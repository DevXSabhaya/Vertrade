import { randomUUID } from 'node:crypto';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { OrderStatus } from '@modules/broker/executors/models/order-status.enum';
import type { OrderResponse } from '@modules/broker/executors/models/order-response.model';
import type { IClock } from '@shared/clock/clock.interface';
import { TradeDirection } from './trade-direction.enum';
import { TradeState } from './trade-state.enum';
import type { TradingMode } from './trading-mode.type';
import { OrderLifecycleStatus } from './order-lifecycle-status.enum';
import { TradeStateTransitions } from './trade-state-transitions';
import { OrderLifecycleTransitions } from './order-lifecycle-transitions';
import { PriceCrossing } from './price-crossing.util';
import { calculateUnrealizedPnl, calculateBookedPnl } from './pnl.util';
import { validateTradeDefinition } from './validate-trade-definition';
import type { CreateTradeParams } from './create-trade.params';
import type { TradeHistoryEntry, TradeSnapshot } from './trade-snapshot';
import { InvalidTradeDefinitionException } from '../exceptions/invalid-trade-definition.exception';
import { UnexpectedBrokerResponseException } from '../exceptions/unexpected-broker-response.exception';
import { TradeCreatedEvent } from '../events/trade-created.event';
import { EntryTriggeredEvent } from '../events/entry-triggered.event';
import { EntryFilledEvent } from '../events/entry-filled.event';
import { TargetHitEvent } from '../events/target-hit.event';
import { TrailingSLMovedEvent } from '../events/trailing-sl-moved.event';
import { StopLossHitEvent } from '../events/stop-loss-hit.event';
import { TradeExitedEvent } from '../events/trade-exited.event';
import { TradeCompletedEvent } from '../events/trade-completed.event';
import { TradeCancelledEvent } from '../events/trade-cancelled.event';
import { TradeRejectedEvent } from '../events/trade-rejected.event';
import { TradeRecoveredEvent } from '../events/trade-recovered.event';
import { TradeFailedEvent } from '../events/trade-failed.event';

/** Outcome of a single price evaluation against an ACTIVE trade. */
export interface PriceEvaluationOutcome {
  readonly targetsHit: number;
  readonly stopLossTriggered: boolean;
}

/**
 * The Trade Aggregate Root. Owns every rule governing a single trade's
 * lifecycle: the trade-level state machine, the nested order-lifecycle for
 * its entry/exit legs, the generalized N-target trailing stop-loss algorithm,
 * and PnL. Nothing outside this class ever mutates its fields directly —
 * every field is private; all access is through getters (returning copies of
 * any array/object) or through the command methods below, each of which
 * validates its own preconditions and queues the domain event(s) it caused.
 */
export class Trade {
  private readonly _id: string;
  private readonly _direction: TradeDirection;
  private readonly _exchange: string;
  private readonly _tradingSymbol: string;
  private readonly _instrumentToken: string;
  private readonly _quantity: number;
  private readonly _entryTriggerPrice: number;
  private readonly _initialStopLoss: number;
  private readonly _targets: readonly number[];
  private readonly _mode: TradingMode;
  private readonly _brokerAccountId: string | null;
  private readonly _metadata: Readonly<Record<string, unknown>>;
  private readonly _createdAt: string;
  private readonly _history: TradeHistoryEntry[] = [];
  private _domainEvents: BaseEvent[] = [];

  private _remainingTargets: number[];
  private _currentStopLoss: number;
  private _state: TradeState;
  private _preRecoveryState: TradeState | null = null;

  private _entryOrderId: string | null = null;
  private _entryOrderLifecycle: OrderLifecycleStatus | null = null;
  private _entryFillPrice: number | null = null;
  private _filledQuantity = 0;

  private _exitOrderId: string | null = null;
  private _exitOrderLifecycle: OrderLifecycleStatus | null = null;
  private _exitedQuantity = 0;
  private _exitProceeds = 0;
  private _exitPrice: number | null = null;
  private _realizedPnl: number | null = null;
  private _awaitingExit = false;

  private _updatedAt: string;

  private constructor(id: string, params: CreateTradeParams, now: Date) {
    this._id = id;
    this._direction = params.direction;
    this._exchange = params.exchange;
    this._tradingSymbol = params.tradingSymbol;
    this._instrumentToken = params.instrumentToken;
    this._quantity = params.quantity;
    this._entryTriggerPrice = params.entryTriggerPrice;
    this._initialStopLoss = params.initialStopLoss;
    this._targets = [...params.targets];
    this._remainingTargets = [...params.targets];
    this._currentStopLoss = params.initialStopLoss;
    this._mode = params.mode;
    this._brokerAccountId = params.brokerAccountId;
    this._metadata = { ...(params.metadata ?? {}) };
    this._createdAt = now.toISOString();
    this._updatedAt = now.toISOString();
    this._state = TradeState.DRAFT;
    this.recordHistory(now);
    this.queueEvent(
      new TradeCreatedEvent(
        this._id,
        this._direction,
        this._quantity,
        this._entryTriggerPrice,
        this._initialStopLoss,
        this._targets,
      ),
    );
  }

  static create(params: CreateTradeParams, clock: IClock): Trade {
    const validation = validateTradeDefinition(params);
    if (validation.isFailure) {
      throw new InvalidTradeDefinitionException(validation.error);
    }
    return new Trade(randomUUID(), params, clock.now());
  }

  /**
   * Rehydrates a Trade aggregate from a previously persisted TradeSnapshot
   * (Phase 9 — Startup Recovery). Reuses the normal constructor (so the
   * definition is re-validated exactly as it was on first creation) and then
   * directly overwrites every mutable field to match the snapshot, discarding
   * the constructor's own bookkeeping (its synthetic `createdAt` history
   * entry and `TradeCreatedEvent`) so recovery never re-emits an event for
   * something that already happened in a previous process.
   */
  static fromSnapshot(snapshot: TradeSnapshot): Trade {
    const params: CreateTradeParams = {
      direction: snapshot.direction,
      exchange: snapshot.exchange,
      tradingSymbol: snapshot.tradingSymbol,
      instrumentToken: snapshot.instrumentToken,
      quantity: snapshot.quantity,
      entryTriggerPrice: snapshot.entryTriggerPrice,
      initialStopLoss: snapshot.initialStopLoss,
      targets: snapshot.targets,
      metadata: snapshot.metadata,
      mode: snapshot.mode,
      brokerAccountId: snapshot.brokerAccountId,
    };
    const trade = new Trade(snapshot.id, params, new Date(snapshot.createdAt));

    trade._state = snapshot.state;
    trade._remainingTargets = [...snapshot.remainingTargets];
    trade._currentStopLoss = snapshot.currentStopLoss;
    trade._entryOrderId = snapshot.entryOrderId;
    trade._entryOrderLifecycle = snapshot.entryOrderLifecycle;
    trade._entryFillPrice = snapshot.entryFillPrice;
    trade._filledQuantity = snapshot.filledQuantity;
    trade._exitOrderId = snapshot.exitOrderId;
    trade._exitOrderLifecycle = snapshot.exitOrderLifecycle;
    trade._exitedQuantity = snapshot.exitedQuantity;
    trade._exitProceeds = snapshot.exitProceeds;
    trade._exitPrice = snapshot.exitPrice;
    trade._realizedPnl = snapshot.realizedPnl;
    trade._awaitingExit = snapshot.isAwaitingExit;
    trade._updatedAt = snapshot.updatedAt;
    trade._history.length = 0;
    trade._history.push(...snapshot.history);
    trade._domainEvents = [];

    return trade;
  }

  // ---------------------------------------------------------------------
  // Read-only accessors
  // ---------------------------------------------------------------------

  get id(): string {
    return this._id;
  }

  get direction(): TradeDirection {
    return this._direction;
  }

  get state(): TradeState {
    return this._state;
  }

  get exchange(): string {
    return this._exchange;
  }

  get tradingSymbol(): string {
    return this._tradingSymbol;
  }

  get instrumentToken(): string {
    return this._instrumentToken;
  }

  get quantity(): number {
    return this._quantity;
  }

  get entryTriggerPrice(): number {
    return this._entryTriggerPrice;
  }

  get initialStopLoss(): number {
    return this._initialStopLoss;
  }

  get currentStopLoss(): number {
    return this._currentStopLoss;
  }

  get targets(): readonly number[] {
    return [...this._targets];
  }

  /** Captured once at creation — see `CreateTradeParams.mode`'s own docstring. Never changes for the lifetime of this trade, even if the deployment's current mode changes later. */
  get mode(): TradingMode {
    return this._mode;
  }

  /** The specific broker account this trade executes through — see `CreateTradeParams.brokerAccountId`'s own docstring. Always `null` for PAPER; never changes for the lifetime of a LIVE trade. */
  get brokerAccountId(): string | null {
    return this._brokerAccountId;
  }

  get remainingTargets(): readonly number[] {
    return [...this._remainingTargets];
  }

  get entryOrderId(): string | null {
    return this._entryOrderId;
  }

  get entryOrderLifecycle(): OrderLifecycleStatus | null {
    return this._entryOrderLifecycle;
  }

  get entryFillPrice(): number | null {
    return this._entryFillPrice;
  }

  get filledQuantity(): number {
    return this._filledQuantity;
  }

  get exitOrderId(): string | null {
    return this._exitOrderId;
  }

  get exitOrderLifecycle(): OrderLifecycleStatus | null {
    return this._exitOrderLifecycle;
  }

  get exitedQuantity(): number {
    return this._exitedQuantity;
  }

  get openQuantity(): number {
    return this._filledQuantity - this._exitedQuantity;
  }

  get exitPrice(): number | null {
    return this._exitPrice;
  }

  get realizedPnl(): number | null {
    return this._realizedPnl;
  }

  get isAwaitingExit(): boolean {
    return this._awaitingExit;
  }

  get metadata(): Readonly<Record<string, unknown>> {
    return { ...this._metadata };
  }

  get history(): readonly TradeHistoryEntry[] {
    return [...this._history];
  }

  /** Unrealized PnL at a given mark price; null before the entry fills. */
  getUnrealizedPnl(markPrice: number): number | null {
    return calculateUnrealizedPnl(
      this._direction,
      this._entryFillPrice,
      this._filledQuantity,
      this.openQuantity,
      markPrice,
    );
  }

  toSnapshot(): TradeSnapshot {
    return {
      id: this._id,
      direction: this._direction,
      state: this._state,
      exchange: this._exchange,
      tradingSymbol: this._tradingSymbol,
      instrumentToken: this._instrumentToken,
      quantity: this._quantity,
      entryTriggerPrice: this._entryTriggerPrice,
      initialStopLoss: this._initialStopLoss,
      currentStopLoss: this._currentStopLoss,
      targets: [...this._targets],
      mode: this._mode,
      brokerAccountId: this._brokerAccountId,
      remainingTargets: [...this._remainingTargets],
      entryOrderId: this._entryOrderId,
      entryOrderLifecycle: this._entryOrderLifecycle,
      entryFillPrice: this._entryFillPrice,
      filledQuantity: this._filledQuantity,
      exitOrderId: this._exitOrderId,
      exitOrderLifecycle: this._exitOrderLifecycle,
      exitedQuantity: this._exitedQuantity,
      exitProceeds: this._exitProceeds,
      openQuantity: this.openQuantity,
      exitPrice: this._exitPrice,
      realizedPnl: this._realizedPnl,
      isAwaitingExit: this._awaitingExit,
      metadata: { ...this._metadata },
      history: [...this._history],
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }

  /** Drains and returns all domain events queued since the last call. */
  pullDomainEvents(): BaseEvent[] {
    const events = this._domainEvents;
    this._domainEvents = [];
    return events;
  }

  // ---------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------

  /** DRAFT -> WAITING_ENTRY: begin monitoring price for the entry trigger. */
  arm(clock: IClock): void {
    this.transitionTo(TradeState.WAITING_ENTRY, clock.now());
  }

  hasCrossedEntry(price: number): boolean {
    return PriceCrossing.hasCrossedEntry(
      this._direction,
      price,
      this._entryTriggerPrice,
    );
  }

  /** WAITING_ENTRY -> ENTRY_PENDING: price crossed entry, order is submitted. */
  triggerEntry(price: number, clock: IClock): void {
    const now = clock.now();
    this.transitionTo(TradeState.ENTRY_PENDING, now);
    this.advanceEntryOrderLifecycle(OrderLifecycleStatus.CREATED);
    this.advanceEntryOrderLifecycle(OrderLifecycleStatus.VALIDATED);
    this.advanceEntryOrderLifecycle(OrderLifecycleStatus.QUEUED);
    this.advanceEntryOrderLifecycle(OrderLifecycleStatus.SUBMITTED);
    this.queueEvent(new EntryTriggeredEvent(this._id, price));
  }

  /** The entry order placement itself threw (network/broker failure). */
  markEntryOrderFailed(reason: string, clock: IClock): void {
    this.advanceEntryOrderLifecycle(OrderLifecycleStatus.FAILED);
    this.transitionTo(TradeState.FAILED, clock.now(), reason);
    this.queueEvent(new TradeFailedEvent(this._id, reason, TradeState.FAILED));
  }

  /** ENTRY_PENDING -> (stays pending | ENTRY_FILLED->ACTIVE | REJECTED | FAILED). */
  applyEntryOrderResponse(response: OrderResponse, clock: IClock): void {
    const now = clock.now();
    this._entryOrderId = response.brokerOrderId;

    switch (response.status) {
      case OrderStatus.FILLED:
      case OrderStatus.PARTIALLY_FILLED: {
        this.advanceEntryOrderLifecycle(
          response.status === OrderStatus.FILLED
            ? OrderLifecycleStatus.FILLED
            : OrderLifecycleStatus.PARTIALLY_FILLED,
        );
        this._entryFillPrice = response.averagePrice ?? this._entryTriggerPrice;
        this._filledQuantity = response.filledQuantity;
        this._currentStopLoss = this._initialStopLoss;

        this.transitionTo(TradeState.ENTRY_FILLED, now);
        this.queueEvent(
          new EntryFilledEvent(
            this._id,
            this._entryOrderId,
            this._entryFillPrice,
            this._filledQuantity,
          ),
        );
        this.transitionTo(TradeState.ACTIVE, now);
        return;
      }
      case OrderStatus.OPEN: {
        this.advanceEntryOrderLifecycle(OrderLifecycleStatus.PENDING);
        return;
      }
      case OrderStatus.REJECTED: {
        this.advanceEntryOrderLifecycle(OrderLifecycleStatus.REJECTED);
        const reason = response.message ?? 'Entry order rejected by broker';
        this.transitionTo(TradeState.REJECTED, now, reason);
        this.queueEvent(new TradeRejectedEvent(this._id, reason));
        return;
      }
      case OrderStatus.FAILED: {
        this.markEntryOrderFailed(
          response.message ?? 'Entry order failed',
          clock,
        );
        return;
      }
      case OrderStatus.CANCELLED:
      case OrderStatus.EXITED:
        throw new UnexpectedBrokerResponseException(
          `An entry order placement can never resolve as ${response.status}`,
        );
    }
  }

  /**
   * ACTIVE price evaluation: walks every remaining target the price has now
   * crossed (in order — never skipping straight to the last one, so a single
   * large price jump still produces one TargetHit + one TrailingSLMoved event
   * per target crossed), trailing the stop loss after each one, then checks
   * whether the (possibly just-updated) stop loss has also been crossed.
   *
   * Trailing rule: after the Nth target (1-indexed) is hit, the new stop loss
   * becomes the (N-1)th target, or the entry fill price if N is 1. This is
   * the entire generalized algorithm — it is identical for 1, 3, 5, 10, or
   * any other number of targets.
   */
  advancePrice(price: number, clock: IClock): PriceEvaluationOutcome {
    let targetsHit = 0;

    while (
      this._remainingTargets.length > 0 &&
      PriceCrossing.hasCrossedTarget(
        this._direction,
        price,
        this._remainingTargets[0],
      )
    ) {
      const target = this._remainingTargets.shift() as number;
      const targetIndex =
        this._targets.length - this._remainingTargets.length - 1;
      const now = clock.now();

      this.transitionTo(TradeState.TARGET_HIT, now);
      this.queueEvent(
        new TargetHitEvent(
          this._id,
          target,
          targetIndex,
          this._remainingTargets.length,
        ),
      );

      const previousStopLoss = this._currentStopLoss;
      const newStopLoss =
        targetIndex === 0
          ? (this._entryFillPrice ?? this._entryTriggerPrice)
          : this._targets[targetIndex - 1];

      this.transitionTo(TradeState.TRAILING_SL_UPDATED, now);
      this._currentStopLoss = newStopLoss;
      this.queueEvent(
        new TrailingSLMovedEvent(this._id, previousStopLoss, newStopLoss),
      );

      this.transitionTo(TradeState.ACTIVE, now);
      targetsHit += 1;
    }

    const stopLossTriggered = PriceCrossing.hasCrossedStopLoss(
      this._direction,
      price,
      this._currentStopLoss,
    );
    if (stopLossTriggered && !this._awaitingExit) {
      this._awaitingExit = true;
      this.queueEvent(
        new StopLossHitEvent(this._id, price, this._currentStopLoss),
      );
    }

    return { targetsHit, stopLossTriggered };
  }

  /** Walks the exit order lifecycle to SUBMITTED just before calling the executor. */
  beginExitAttempt(): void {
    this._exitOrderLifecycle = null;
    this.advanceExitOrderLifecycle(OrderLifecycleStatus.CREATED);
    this.advanceExitOrderLifecycle(OrderLifecycleStatus.VALIDATED);
    this.advanceExitOrderLifecycle(OrderLifecycleStatus.QUEUED);
    this.advanceExitOrderLifecycle(OrderLifecycleStatus.SUBMITTED);
  }

  /** Exit order placement itself threw — remain ACTIVE, retry on next tick. */
  markExitAttemptFailed(): void {
    this.advanceExitOrderLifecycle(OrderLifecycleStatus.FAILED);
    this._exitOrderLifecycle = null;
  }

  /**
   * Applies the response to an exit attempt (full or partial). Fully closes
   * the trade (-> COMPLETED, realized PnL computed) only once the entire
   * filled quantity has been exited; a partial exit fill keeps the trade
   * ACTIVE and awaiting exit so the Engine retries the remainder.
   */
  applyExitOrderResponse(response: OrderResponse, clock: IClock): void {
    const now = clock.now();
    this._exitOrderId = response.brokerOrderId;

    switch (response.status) {
      case OrderStatus.FILLED:
      case OrderStatus.PARTIALLY_FILLED: {
        this.advanceExitOrderLifecycle(
          response.status === OrderStatus.FILLED
            ? OrderLifecycleStatus.FILLED
            : OrderLifecycleStatus.PARTIALLY_FILLED,
        );
        const fillPrice = response.averagePrice ?? this._currentStopLoss;
        this._exitedQuantity += response.filledQuantity;
        this._exitProceeds += fillPrice * response.filledQuantity;

        if (this.openQuantity > 0) {
          // Remainder still open: stay ACTIVE and awaiting exit for a retry.
          this._exitOrderLifecycle = null;
          return;
        }

        this._exitPrice = this._exitProceeds / this._exitedQuantity;
        this._realizedPnl = calculateBookedPnl(
          this._direction,
          this._entryFillPrice,
          this._exitProceeds,
          this._exitedQuantity,
        );
        this._awaitingExit = false;

        this.advanceExitOrderLifecycle(OrderLifecycleStatus.COMPLETED);
        this.queueEvent(
          new TradeExitedEvent(
            this._id,
            this._exitOrderId,
            this._exitPrice,
            this._exitedQuantity,
          ),
        );
        this.transitionTo(TradeState.COMPLETED, now);
        this.queueEvent(
          new TradeCompletedEvent(this._id, this._realizedPnl ?? 0),
        );
        return;
      }
      case OrderStatus.OPEN: {
        this.advanceExitOrderLifecycle(OrderLifecycleStatus.PENDING);
        return;
      }
      case OrderStatus.REJECTED: {
        this.advanceExitOrderLifecycle(OrderLifecycleStatus.REJECTED);
        this._exitOrderLifecycle = null;
        return;
      }
      case OrderStatus.FAILED: {
        this.advanceExitOrderLifecycle(OrderLifecycleStatus.FAILED);
        this._exitOrderLifecycle = null;
        return;
      }
      case OrderStatus.CANCELLED:
      case OrderStatus.EXITED:
        throw new UnexpectedBrokerResponseException(
          `An exit order placement can never resolve as ${response.status}`,
        );
    }
  }

  /** Only valid pre-fill: DRAFT, WAITING_ENTRY, or ENTRY_PENDING. */
  cancel(reason: string, clock: IClock): void {
    this.transitionTo(TradeState.CANCELLED, clock.now(), reason);
    this.queueEvent(new TradeCancelledEvent(this._id, reason));
  }

  reject(reason: string, clock: IClock): void {
    this.transitionTo(TradeState.REJECTED, clock.now(), reason);
    this.queueEvent(new TradeRejectedEvent(this._id, reason));
  }

  markFailed(reason: string, clock: IClock): void {
    this.transitionTo(TradeState.FAILED, clock.now(), reason);
    this.queueEvent(new TradeFailedEvent(this._id, reason, TradeState.FAILED));
  }

  markError(reason: string, clock: IClock): void {
    this.transitionTo(TradeState.ERROR, clock.now(), reason);
    this.queueEvent(new TradeFailedEvent(this._id, reason, TradeState.ERROR));
  }

  /** Any non-terminal state -> RECOVERY, remembering where to resume from. */
  enterRecovery(reason: string, clock: IClock): void {
    this._preRecoveryState = this._state;
    this.transitionTo(TradeState.RECOVERY, clock.now(), reason);
  }

  /** RECOVERY -> whatever non-terminal state the trade was in before. */
  resumeFromRecovery(clock: IClock): void {
    const resumeTo = this._preRecoveryState;
    if (resumeTo === null) {
      throw new UnexpectedBrokerResponseException(
        'Cannot resume from recovery: no prior state was recorded',
      );
    }
    this.transitionTo(resumeTo, clock.now());
    this._preRecoveryState = null;
    this.queueEvent(new TradeRecoveredEvent(this._id, resumeTo));
  }

  /**
   * Moves the stop loss to a caller-supplied value (Phase 10's configurable
   * Trailing Stop Engine — fixed points/percentage/step/break-even
   * strategies computed outside this aggregate). Only ever valid while
   * ACTIVE, and only ever in the profit-locking direction: for a LONG trade
   * the new stop loss must be >= the current one; for SHORT, <=. A proposed
   * value that would move the stop loss backward (or an inactive trade) is
   * silently rejected (returns `false`) rather than throwing — the caller is
   * a periodic tick evaluation, not a user action, so a rejected proposal is
   * an ordinary "no adjustment needed" outcome, not an error. Reuses
   * TrailingSLMovedEvent — from the aggregate's point of view, "the stop
   * loss moved" is the same fact regardless of which strategy computed the
   * new value.
   */
  moveStopLoss(newStopLoss: number, clock: IClock): boolean {
    if (this._state !== TradeState.ACTIVE) {
      return false;
    }
    const movesForward =
      this._direction === TradeDirection.LONG
        ? newStopLoss > this._currentStopLoss
        : newStopLoss < this._currentStopLoss;
    if (!movesForward) {
      return false;
    }

    const previousStopLoss = this._currentStopLoss;
    this._currentStopLoss = newStopLoss;
    this._updatedAt = clock.now().toISOString();
    this.queueEvent(
      new TrailingSLMovedEvent(this._id, previousStopLoss, newStopLoss),
    );
    return true;
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private directionSign(): 1 | -1 {
    return this._direction === TradeDirection.LONG ? 1 : -1;
  }

  private transitionTo(next: TradeState, now: Date, reason?: string): void {
    TradeStateTransitions.assertTransition(this._state, next);
    this._state = next;
    this._updatedAt = now.toISOString();
    this.recordHistory(now, reason);
  }

  private recordHistory(now: Date, reason?: string): void {
    this._history.push({
      state: this._state,
      occurredAt: now.toISOString(),
      ...(reason !== undefined ? { reason } : {}),
    });
  }

  private advanceEntryOrderLifecycle(next: OrderLifecycleStatus): void {
    OrderLifecycleTransitions.assertTransition(this._entryOrderLifecycle, next);
    this._entryOrderLifecycle = next;
  }

  private advanceExitOrderLifecycle(next: OrderLifecycleStatus): void {
    OrderLifecycleTransitions.assertTransition(this._exitOrderLifecycle, next);
    this._exitOrderLifecycle = next;
  }

  private queueEvent(event: BaseEvent): void {
    this._domainEvents.push(event);
  }
}
