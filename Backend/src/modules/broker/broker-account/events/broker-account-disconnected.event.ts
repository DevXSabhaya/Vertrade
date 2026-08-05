import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class BrokerAccountDisconnectedEvent extends DomainEvent {
  readonly eventName = 'broker-account.disconnected';

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
  ) {
    super();
  }
}
