import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class BrokerDisconnectedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'broker-health.broker.disconnected';
  readonly eventName = BrokerDisconnectedEvent.EVENT_NAME;

  constructor(public readonly reason: string) {
    super();
  }
}
