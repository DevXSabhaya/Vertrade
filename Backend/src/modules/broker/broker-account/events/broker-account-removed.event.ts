import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class BrokerAccountRemovedEvent extends DomainEvent {
  readonly eventName = 'broker-account.removed';

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
  ) {
    super();
  }
}
