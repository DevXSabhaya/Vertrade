import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class MarketCloseCompletedEvent extends DomainEvent {
  readonly eventName = 'scheduler.market-close.completed';

  constructor(
    public readonly expiredQueueItems: number,
    public readonly cleanedLocks: number,
  ) {
    super();
  }
}
