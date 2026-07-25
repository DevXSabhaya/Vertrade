import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class EmergencyStopActivatedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.emergency-stop.activated';
  readonly eventName = EmergencyStopActivatedEvent.EVENT_NAME;

  constructor(
    public readonly reason: string,
    public readonly triggeredBy: string,
  ) {
    super();
  }
}
