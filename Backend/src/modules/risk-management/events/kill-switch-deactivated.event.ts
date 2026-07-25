import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class KillSwitchDeactivatedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.kill-switch.deactivated';
  readonly eventName = KillSwitchDeactivatedEvent.EVENT_NAME;

  constructor(public readonly deactivatedBy: string) {
    super();
  }
}
