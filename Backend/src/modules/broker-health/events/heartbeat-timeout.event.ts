import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class HeartbeatTimeoutEvent extends DomainEvent {
  readonly eventName = 'broker-health.heartbeat.timeout';

  constructor(public readonly ageMs: number) {
    super();
  }
}
