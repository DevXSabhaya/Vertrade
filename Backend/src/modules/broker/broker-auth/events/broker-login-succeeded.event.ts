import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class BrokerLoginSucceededEvent extends DomainEvent {
  readonly eventName = 'broker.login.succeeded';

  constructor(public readonly clientCode: string) {
    super();
  }
}
