import { DomainEvent } from '@core/event-bus/events/domain-event.base';

/** Not one of the spec's 16 named events, but required to give `POST /risk/emergency-stop/reset` an audit trail symmetric with `EmergencyStopActivatedEvent`. */
export class EmergencyStopResetEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.emergency-stop.reset';
  readonly eventName = EmergencyStopResetEvent.EVENT_NAME;

  constructor(public readonly resetBy: string) {
    super();
  }
}
