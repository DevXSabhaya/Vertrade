import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { RecoveryStep } from '../models/recovery-step.enum';

export class RecoveryStepCompletedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'recovery.step.completed';
  readonly eventName = RecoveryStepCompletedEvent.EVENT_NAME;

  constructor(
    public readonly recoveryId: string,
    public readonly step: RecoveryStep,
    public readonly durationMs: number,
  ) {
    super();
  }
}
