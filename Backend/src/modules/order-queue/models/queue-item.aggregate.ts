import type { ResolvedInstrument } from '@modules/instrument-resolver/resolved-instrument.vo';
import type { TradeValidationRequest } from '@modules/trade-validation/models/trade-validation-request.model';
import type { IClock } from '@shared/clock/clock.interface';
import { QueueItemState } from './queue-item-state.enum';
import type { QueueItemType } from './queue-item-type.enum';
import { QueueItemTransitions } from './queue-item-transitions';
import type {
  QueueItemHistoryEntry,
  QueueItemSnapshot,
} from './queue-item-snapshot';

/**
 * The queue's own aggregate root — deliberately mirrors the Trade aggregate's
 * shape (private fields, transition-validated state changes, a history log,
 * an immutable toSnapshot()) for the same reasons: every state change is
 * self-validating and nothing outside this class can corrupt it.
 */
export class QueueItem {
  private _state = QueueItemState.QUEUED;
  private _attempts = 0;
  private _lockOwner: string | null = null;
  private _lockedAt: Date | null = null;
  private _lastError: string | null = null;
  private _resultTradeId: string | null = null;
  private readonly _createdAt: string;
  private _updatedAt: string;
  private readonly _history: QueueItemHistoryEntry[] = [];

  constructor(
    public readonly id: string,
    /** The user who submitted this trade — resolved into `CreateTradeParams.mode`/`brokerAccountId` at the moment of actual execution (`QueueWorker.buildCreateTradeParams`), not at submission time, since a queued item can wait a long time before that runs. */
    public readonly userId: string,
    public readonly idempotencyKey: string,
    public readonly orderType: QueueItemType,
    public readonly request: TradeValidationRequest,
    public readonly resolvedInstrument: ResolvedInstrument,
    now: Date,
  ) {
    this._createdAt = now.toISOString();
    this._updatedAt = now.toISOString();
    this.recordHistory(now);
  }

  get state(): QueueItemState {
    return this._state;
  }

  get attempts(): number {
    return this._attempts;
  }

  get lockOwner(): string | null {
    return this._lockOwner;
  }

  get lockedAt(): Date | null {
    return this._lockedAt;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  get resultTradeId(): string | null {
    return this._resultTradeId;
  }

  get createdAt(): string {
    return this._createdAt;
  }

  /** Rehydrates a QueueItem from a persisted snapshot (repository recovery path). */
  static fromSnapshot(snapshot: QueueItemSnapshot): QueueItem {
    const item = new QueueItem(
      snapshot.id,
      snapshot.userId,
      snapshot.idempotencyKey,
      snapshot.orderType,
      snapshot.request,
      snapshot.resolvedInstrument,
      new Date(snapshot.createdAt),
    );
    item._state = snapshot.state;
    item._attempts = snapshot.attempts;
    item._lockOwner = snapshot.lockOwner;
    item._lockedAt = snapshot.lockedAt ? new Date(snapshot.lockedAt) : null;
    item._lastError = snapshot.lastError;
    item._resultTradeId = snapshot.resultTradeId;
    item._updatedAt = snapshot.updatedAt;
    item._history.length = 0;
    item._history.push(...snapshot.history);
    return item;
  }

  lock(ownerId: string, clock: IClock): void {
    this.transitionTo(QueueItemState.LOCKED, clock.now());
    this._lockOwner = ownerId;
    this._lockedAt = clock.now();
  }

  beginProcessing(clock: IClock): void {
    this.transitionTo(QueueItemState.PROCESSING, clock.now());
  }

  markSubmitted(tradeId: string, clock: IClock): void {
    this._resultTradeId = tradeId;
    this.transitionTo(QueueItemState.SUBMITTED, clock.now());
  }

  markCompleted(clock: IClock): void {
    this.transitionTo(QueueItemState.COMPLETED, clock.now());
    this._lockOwner = null;
    this._lockedAt = null;
  }

  /**
   * Legal from QUEUED (a lock-acquisition failure before ever being locked)
   * or PROCESSING (a failure during the actual attempt). Also legal to call
   * while already RETRYING — a second consecutive lock-acquisition failure,
   * for example — in which case only the retry bookkeeping advances; the
   * state itself doesn't need a further transition since it's already where
   * it needs to be.
   */
  scheduleRetry(reason: string, clock: IClock): void {
    this._attempts += 1;
    this._lastError = reason;
    this._lockOwner = null;
    this._lockedAt = null;
    if (this._state === QueueItemState.RETRYING) {
      const now = clock.now();
      this._updatedAt = now.toISOString();
      this.recordHistory(now, reason);
      return;
    }
    this.transitionTo(QueueItemState.RETRYING, clock.now(), reason);
  }

  markFailed(reason: string, clock: IClock): void {
    this._lastError = reason;
    this._lockOwner = null;
    this._lockedAt = null;
    this.transitionTo(QueueItemState.FAILED, clock.now(), reason);
  }

  cancel(reason: string, clock: IClock): void {
    this.transitionTo(QueueItemState.CANCELLED, clock.now(), reason);
  }

  expire(clock: IClock): void {
    this.transitionTo(QueueItemState.EXPIRED, clock.now());
  }

  /** Resets a stale post-restart LOCKED/PROCESSING/RETRYING item back to QUEUED. */
  resetForRecovery(clock: IClock): void {
    this._lockOwner = null;
    this._lockedAt = null;
    this._state = QueueItemState.QUEUED;
    this.recordHistory(clock.now(), 'reset for restart recovery');
  }

  toSnapshot(): QueueItemSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      idempotencyKey: this.idempotencyKey,
      orderType: this.orderType,
      state: this._state,
      request: this.request,
      resolvedInstrument: this.resolvedInstrument,
      attempts: this._attempts,
      lockOwner: this._lockOwner,
      lockedAt: this._lockedAt ? this._lockedAt.toISOString() : null,
      lastError: this._lastError,
      resultTradeId: this._resultTradeId,
      history: [...this._history],
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }

  private transitionTo(next: QueueItemState, now: Date, reason?: string): void {
    QueueItemTransitions.assertTransition(this._state, next);
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
}
