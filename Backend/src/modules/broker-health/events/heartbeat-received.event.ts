import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class HeartbeatReceivedEvent extends DomainEvent {
  readonly eventName = 'broker-health.heartbeat.received';

  constructor(public readonly latencyMs: number) {
    super();
  }
}
