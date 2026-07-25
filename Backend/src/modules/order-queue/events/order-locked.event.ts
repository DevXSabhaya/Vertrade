import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class OrderLockedEvent extends DomainEvent {
  readonly eventName = 'order-queue.order.locked';

  constructor(
    public readonly queueItemId: string,
    public readonly lockOwner: string,
  ) {
    super();
  }
}
