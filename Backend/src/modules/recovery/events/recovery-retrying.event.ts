import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { RecoveryStep } from '../models/recovery-step.enum';

export class RecoveryRetryingEvent extends DomainEvent {
  static readonly EVENT_NAME = 'recovery.retrying';
  readonly eventName = RecoveryRetryingEvent.EVENT_NAME;

  constructor(
    public readonly recoveryId: string,
    public readonly step: RecoveryStep,
    public readonly attempt: number,
    public readonly reason: string,
  ) {
    super();
  }
}
