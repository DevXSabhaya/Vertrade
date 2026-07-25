import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class OrderProcessingEvent extends DomainEvent {
  readonly eventName = 'order-queue.order.processing';

  constructor(
    public readonly queueItemId: string,
    public readonly attempt: number,
  ) {
    super();
  }
}
