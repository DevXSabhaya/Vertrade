import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class BrokerRecoveredEvent extends DomainEvent {
  readonly eventName = 'broker-health.broker.recovered';

  constructor(public readonly downtimeMs: number) {
    super();
  }
}
