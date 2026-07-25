import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class OrderFailedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'order-queue.order.failed';
  readonly eventName = OrderFailedEvent.EVENT_NAME;

  constructor(
    public readonly queueItemId: string,
    public readonly reason: string,
  ) {
    super();
  }
}
