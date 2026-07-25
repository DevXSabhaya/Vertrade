import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class HeartbeatRecoveredEvent extends DomainEvent {
  readonly eventName = 'broker-health.heartbeat.recovered';

  constructor(public readonly downtimeMs: number) {
    super();
  }
}
