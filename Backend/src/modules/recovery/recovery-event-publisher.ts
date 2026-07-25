import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { RecoveryStep } from './models/recovery-step.enum';
import {
  RecoveryStartedEvent,
  RecoveryStepCompletedEvent,
  RecoveryCompletedEvent,
  RecoveryFailedEvent,
  RecoveryRetryingEvent,
  RecoverySnapshotSavedEvent,
  EngineRecoveredEvent,
  QueueRecoveredEvent,
} from './events';

/**
 * The single place RecoveryCoordinator (and its collaborators) go to publish
 * a Recovery-domain event — keeps every other Recovery component free of a
 * direct EVENT_BUS dependency, and keeps the exact wording/shape of each
 * event centralized in one file.
 */
@Injectable()
export class RecoveryEventPublisher {
  constructor(@Inject(EVENT_BUS) private readonly eventBus: IEventBus) {}

  started(recoveryId: string): void {
    this.eventBus.publish(new RecoveryStartedEvent(recoveryId));
  }

  stepCompleted(
    recoveryId: string,
    step: RecoveryStep,
    durationMs: number,
  ): void {
    this.eventBus.publish(
      new RecoveryStepCompletedEvent(recoveryId, step, durationMs),
    );
  }

  completed(
    recoveryId: string,
    durationMs: number,
    tradesRecovered: number,
    queueItemsRecovered: number,
  ): void {
    this.eventBus.publish(
      new RecoveryCompletedEvent(
        recoveryId,
        durationMs,
        tradesRecovered,
        queueItemsRecovered,
      ),
    );
  }

  failed(recoveryId: string, failedStep: RecoveryStep, reason: string): void {
    this.eventBus.publish(
      new RecoveryFailedEvent(recoveryId, failedStep, reason),
    );
  }

  retrying(
    recoveryId: string,
    step: RecoveryStep,
    attempt: number,
    reason: string,
  ): void {
    this.eventBus.publish(
      new RecoveryRetryingEvent(recoveryId, step, attempt, reason),
    );
  }

  snapshotSaved(
    snapshotId: string,
    tradeCount: number,
    queueItemCount: number,
  ): void {
    this.eventBus.publish(
      new RecoverySnapshotSavedEvent(snapshotId, tradeCount, queueItemCount),
    );
  }

  engineRecovered(recoveryId: string, tradeCount: number): void {
    this.eventBus.publish(new EngineRecoveredEvent(recoveryId, tradeCount));
  }

  queueRecovered(recoveryId: string, itemCount: number): void {
    this.eventBus.publish(new QueueRecoveredEvent(recoveryId, itemCount));
  }
}
