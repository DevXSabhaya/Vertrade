import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { ConfigService } from '@core/config/config.service';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TradeValidationService } from '@modules/trade-validation/trade-validation.service';
import type { TradeValidationRequest } from '@modules/trade-validation/models/trade-validation-request.model';
import { ValidationFailureCode } from '@modules/trade-validation/models/validation-failure-code.enum';
import { QueueItem } from './models/queue-item.aggregate';
import { QueueItemState } from './models/queue-item-state.enum';
import { QueueItemType } from './models/queue-item-type.enum';
import { QueueItemTransitions } from './models/queue-item-transitions';
import type { QueueItemSnapshot } from './models/queue-item-snapshot';
import type { OrderQueueSubmissionResult } from './models/order-queue-submission-result.model';
import type { QueueMetricsSnapshot } from './models/queue-metrics-snapshot';
import { IdempotencyKeyGenerator } from './idempotency/idempotency-key-generator';
import { QueueWorker } from './queue-worker.service';
import { QueueMetricsService } from './metrics/queue-metrics.service';
import { LockManager } from './lock/lock-manager';
import { MAX_QUEUE_SIZE, QUEUE_REPOSITORY } from './order-queue.constants';
import type { IQueueItemRepository } from './interfaces/queue-item-repository.interface';
import { QueueItemNotFoundException } from './exceptions/queue-item-not-found.exception';
import {
  TradeValidatedEvent,
  TradeValidationFailedEvent,
  OrderQueuedEvent,
  OrderCancelledEvent,
  QueueOverflowEvent,
} from './events';

/**
 * The only entrypoint a trade request may enter the system through:
 * Trade -> Validation -> Queue -> Lock -> Executor -> Success/Retry/Failed.
 * Nothing skips the queue. The in-memory map is the runtime source of truth
 * (fast, synchronous dedup check); every state change is also durably
 * persisted so a restart can recover in-flight items.
 */
@Injectable()
export class OrderQueueService implements OnModuleInit {
  private readonly items = new Map<string, QueueItem>();

  constructor(
    private readonly tradeValidationService: TradeValidationService,
    private readonly queueWorker: QueueWorker,
    private readonly queueMetrics: QueueMetricsService,
    private readonly lockManager: LockManager,
    @Inject(QUEUE_REPOSITORY) private readonly repository: IQueueItemRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(MAX_QUEUE_SIZE) private readonly maxQueueSize: number,
    private readonly configService: ConfigService,
  ) {}

  /** Restart recovery: reload every non-terminal item and resume processing it. */
  async onModuleInit(): Promise<void> {
    const recoverable = await this.repository.findRecoverable();
    for (const snapshot of recoverable) {
      const item = QueueItem.fromSnapshot(snapshot);

      if (snapshot.state === QueueItemState.SUBMITTED) {
        // SUBMITTED means createTrade() already succeeded before the crash
        // (resultTradeId is set) — the trade itself is rehydrated separately
        // by Recovery's RESTORE_TRADING_ENGINE step from its own persisted
        // snapshot. Requeuing this item like the pre-trade-creation states
        // below would call createTrade() a second time and arm a duplicate
        // Trade aggregate for the same idempotency key. This item's own work
        // is done, so it is simply completed rather than replayed.
        item.markCompleted(this.clock);
        await this.repository.save(item.toSnapshot());
        this.items.set(item.idempotencyKey, item);
        continue;
      }

      if (
        snapshot.state !== QueueItemState.QUEUED &&
        !QueueItemTransitions.isTerminal(snapshot.state)
      ) {
        // Any lock held by a now-dead process is meaningless after a restart.
        item.resetForRecovery(this.clock);
        await this.repository.save(item.toSnapshot());
      }
      this.items.set(item.idempotencyKey, item);
      void this.queueWorker.enqueue(item, this.workerOwnerId(item.id));
    }
  }

  async submitTrade(
    request: TradeValidationRequest,
    requesterId: string,
  ): Promise<OrderQueueSubmissionResult> {
    if (this.configService.killSwitchEnabled) {
      return { outcome: 'REJECTED_KILL_SWITCH' };
    }

    const idempotencyKey = IdempotencyKeyGenerator.generate({
      explicitKey: request.idempotencyKey,
      instrumentToken: request.rawSymbol.trim().toUpperCase(),
      orderType: QueueItemType.CREATE_TRADE,
      direction: request.direction,
      quantity: request.quantity,
      entryTriggerPrice: request.entryTriggerPrice,
      now: this.clock.now(),
    });

    // Synchronous check-then-insert: no `await` occurs between this read and
    // the eventual `this.items.set()` below, so — since Node.js runs a single
    // event loop — no other call can interleave here. This alone is what
    // makes "duplicate requests return the existing item" race-free.
    const existing = this.items.get(idempotencyKey);
    if (existing) {
      this.eventBus.publish(
        new OrderQueuedEvent(existing.id, idempotencyKey, true),
      );
      return { outcome: 'DUPLICATE', item: existing.toSnapshot() };
    }

    const validationResult =
      await this.tradeValidationService.validate(request);
    if (!validationResult.isValid || !validationResult.resolvedInstrument) {
      const failure = validationResult.failure ?? {
        code: ValidationFailureCode.INSTRUMENT_NOT_FOUND,
        reason: ValidationFailureCode.INSTRUMENT_NOT_FOUND,
        message: 'Validation failed without a specific reason',
        failedRule: 'TradeValidationService',
        timestamp: this.clock.now().toISOString(),
      };
      this.eventBus.publish(
        new TradeValidationFailedEvent(request.rawSymbol, failure),
      );
      return { outcome: 'VALIDATION_FAILED', failure };
    }
    const resolvedInstrument = validationResult.resolvedInstrument;

    if (this.items.size >= this.maxQueueSize) {
      this.eventBus.publish(
        new QueueOverflowEvent(this.items.size, this.maxQueueSize),
      );
      return { outcome: 'QUEUE_FULL' };
    }

    // Re-check post-validation: validation is async, so another request for
    // the exact same idempotency key could have been enqueued while this one
    // awaited. Still race-free: this second check is followed immediately
    // (no further await) by the insert.
    const raceWinner = this.items.get(idempotencyKey);
    if (raceWinner) {
      this.eventBus.publish(
        new OrderQueuedEvent(raceWinner.id, idempotencyKey, true),
      );
      return { outcome: 'DUPLICATE', item: raceWinner.toSnapshot() };
    }

    this.eventBus.publish(
      new TradeValidatedEvent(
        idempotencyKey,
        resolvedInstrument.instrumentToken,
      ),
    );

    const item = new QueueItem(
      randomUUID(),
      idempotencyKey,
      QueueItemType.CREATE_TRADE,
      request,
      resolvedInstrument,
      this.clock.now(),
    );
    this.items.set(idempotencyKey, item);
    await this.repository.save(item.toSnapshot());
    this.eventBus.publish(new OrderQueuedEvent(item.id, idempotencyKey, false));

    void this.queueWorker.enqueue(item, requesterId);

    return { outcome: 'QUEUED', item: item.toSnapshot() };
  }

  async cancel(
    idempotencyKey: string,
    reason: string,
  ): Promise<QueueItemSnapshot> {
    const item = this.requireItem(idempotencyKey);
    item.cancel(reason, this.clock);
    await this.repository.save(item.toSnapshot());
    this.eventBus.publish(new OrderCancelledEvent(item.id, reason));
    return item.toSnapshot();
  }

  getItem(idempotencyKey: string): QueueItemSnapshot {
    return this.requireItem(idempotencyKey).toSnapshot();
  }

  getAllItems(): QueueItemSnapshot[] {
    return Array.from(this.items.values(), (item) => item.toSnapshot());
  }

  getMetrics(): QueueMetricsSnapshot {
    const queueSize = Array.from(this.items.values()).filter(
      (item) =>
        item.state === QueueItemState.QUEUED ||
        item.state === QueueItemState.RETRYING,
    ).length;
    return this.queueMetrics.snapshot(queueSize, this.queueWorker.inFlight);
  }

  /** Re-enqueues every still-QUEUED item — used to resume after the kill switch is turned back off. */
  async resumeQueue(): Promise<void> {
    this.queueWorker.resume();
    for (const item of this.items.values()) {
      if (item.state === QueueItemState.QUEUED) {
        void this.queueWorker.enqueue(item, this.workerOwnerId(item.id));
      }
    }
    await this.queueWorker.drain();
  }

  async drain(): Promise<void> {
    await this.queueWorker.drain();
  }

  /**
   * Marks any item that has sat QUEUED for longer than `maxAgeMs` as
   * EXPIRED (a legal QUEUED -> EXPIRED transition) — items stuck this long
   * are almost certainly waiting on a paused/kill-switched worker that will
   * never resume them on its own. Added in Phase 8 for the Scheduler's
   * CleanupJob; safe to call at any time, including manually.
   */
  async expireStaleItems(maxAgeMs: number): Promise<number> {
    const now = this.clock.now();
    let expiredCount = 0;

    for (const item of this.items.values()) {
      if (item.state !== QueueItemState.QUEUED) {
        continue;
      }
      const ageMs = now.getTime() - new Date(item.createdAt).getTime();
      if (ageMs > maxAgeMs) {
        item.expire(this.clock);
        await this.repository.save(item.toSnapshot());
        expiredCount += 1;
      }
    }

    return expiredCount;
  }

  /** Delegates to LockManager — kept encapsulated behind OrderQueueService's
   * exported surface rather than exporting LockManager itself. Added in
   * Phase 8 for the Scheduler's CleanupJob. */
  cleanupLocks(): number {
    return this.lockManager.cleanupStaleLocks();
  }

  /**
   * Evicts terminal (COMPLETED/FAILED/CANCELLED/EXPIRED) items from the
   * in-memory `items` map once they've sat there for longer than `maxAgeMs`.
   * Without this, `items` grows without bound for the lifetime of the
   * process — every trade this deployment ever places adds one entry that
   * nothing previously ever removed, a slow memory leak that only becomes
   * visible after days/weeks of continuous production uptime. Safe: the
   * durable Mongo repository (`QUEUE_REPOSITORY`) already has every item's
   * full history independent of this in-memory map, and a terminal item's
   * idempotency key deliberately does NOT need to keep deduping anything —
   * `IdempotencyKeyGenerator`'s coarse time bucket has long since rolled
   * over by the time an item is old enough to prune here.
   */
  pruneCompletedItems(maxAgeMs: number): number {
    const now = this.clock.now().getTime();
    let removedCount = 0;

    for (const [key, item] of this.items) {
      if (!QueueItemTransitions.isTerminal(item.state)) {
        continue;
      }
      const ageMs = now - new Date(item.toSnapshot().updatedAt).getTime();
      if (ageMs > maxAgeMs) {
        this.items.delete(key);
        removedCount += 1;
      }
    }

    return removedCount;
  }

  private requireItem(idempotencyKey: string): QueueItem {
    const item = this.items.get(idempotencyKey);
    if (!item) {
      throw new QueueItemNotFoundException(
        `No queue item found with idempotency key ${idempotencyKey}`,
      );
    }
    return item;
  }

  private workerOwnerId(itemId: string): string {
    return `recovery:${itemId}`;
  }
}
