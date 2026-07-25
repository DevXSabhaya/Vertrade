import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class SubscriptionAddedEvent extends DomainEvent {
  readonly eventName = 'market-data.subscription.added';

  constructor(
    public readonly instrumentToken: string,
    public readonly subscriberId: string,
  ) {
    super();
  }
}
