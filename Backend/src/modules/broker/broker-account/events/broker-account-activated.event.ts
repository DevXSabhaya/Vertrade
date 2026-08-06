import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class BrokerAccountActivatedEvent extends DomainEvent {
  readonly eventName = 'broker-account.activated';

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly brokerId: string,
  ) {
    super();
  }
}
