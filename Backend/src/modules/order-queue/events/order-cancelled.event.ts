import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class OrderCancelledEvent extends DomainEvent {
  readonly eventName = 'order-queue.order.cancelled';

  constructor(
    public readonly queueItemId: string,
    public readonly reason: string,
  ) {
    super();
  }
}
