import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class BrokerSessionExpiredEvent extends DomainEvent {
  readonly eventName = 'broker.session.expired';

  constructor(public readonly clientCode: string) {
    super();
  }
}
