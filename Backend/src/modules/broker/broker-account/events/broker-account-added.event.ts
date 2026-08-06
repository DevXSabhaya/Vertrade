import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class BrokerAccountAddedEvent extends DomainEvent {
  readonly eventName = 'broker-account.added';

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly brokerId: string,
  ) {
    super();
  }
}
