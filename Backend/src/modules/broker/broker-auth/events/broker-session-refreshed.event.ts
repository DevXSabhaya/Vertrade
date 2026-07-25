import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class BrokerSessionRefreshedEvent extends DomainEvent {
  readonly eventName = 'broker.session.refreshed';

  constructor(public readonly clientCode: string) {
    super();
  }
}
