import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class BrokerHealthyEvent extends DomainEvent {
  static readonly EVENT_NAME = 'broker-health.broker.healthy';
  readonly eventName = BrokerHealthyEvent.EVENT_NAME;

  constructor(public readonly previousStatus: string) {
    super();
  }
}
