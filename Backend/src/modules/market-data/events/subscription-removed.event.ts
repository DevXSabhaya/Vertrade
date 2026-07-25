import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class SubscriptionRemovedEvent extends DomainEvent {
  readonly eventName = 'market-data.subscription.removed';

  constructor(
    public readonly instrumentToken: string,
    public readonly subscriberId: string,
  ) {
    super();
  }
}
