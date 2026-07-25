import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class BrokerWarningEvent extends DomainEvent {
  readonly eventName = 'broker-health.broker.warning';

  constructor(public readonly reason: string) {
    super();
  }
}
