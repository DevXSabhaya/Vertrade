import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class BrokerLogoutCompletedEvent extends DomainEvent {
  readonly eventName = 'broker.logout.completed';

  constructor(public readonly clientCode: string) {
    super();
  }
}
