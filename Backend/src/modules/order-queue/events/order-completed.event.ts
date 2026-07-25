import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class OrderCompletedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'order-queue.order.completed';
  readonly eventName = OrderCompletedEvent.EVENT_NAME;

  constructor(
    public readonly queueItemId: string,
    public readonly tradeId: string,
  ) {
    super();
  }
}
