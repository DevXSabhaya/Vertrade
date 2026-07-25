import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class RecoveryStartedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'recovery.started';
  readonly eventName = RecoveryStartedEvent.EVENT_NAME;

  constructor(public readonly recoveryId: string) {
    super();
  }
}
