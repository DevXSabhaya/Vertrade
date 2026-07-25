import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class BrokerLoginStartedEvent extends DomainEvent {
  readonly eventName = 'broker.login.started';
}
