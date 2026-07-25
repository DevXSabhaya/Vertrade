import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class BrokerLoginFailedEvent extends DomainEvent {
  readonly eventName = 'broker.login.failed';

  constructor(public readonly reason: string) {
    super();
  }
}
