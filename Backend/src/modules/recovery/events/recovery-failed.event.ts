import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { RecoveryStep } from '../models/recovery-step.enum';

export class RecoveryFailedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'recovery.failed';
  readonly eventName = RecoveryFailedEvent.EVENT_NAME;

  constructor(
    public readonly recoveryId: string,
    public readonly failedStep: RecoveryStep,
    public readonly reason: string,
  ) {
    super();
  }
}
