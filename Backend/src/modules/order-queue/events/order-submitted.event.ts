import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class OrderSubmittedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'order-queue.order.submitted';
  readonly eventName = OrderSubmittedEvent.EVENT_NAME;

  constructor(
    public readonly queueItemId: string,
    public readonly tradeId: string,
  ) {
    super();
  }
}
