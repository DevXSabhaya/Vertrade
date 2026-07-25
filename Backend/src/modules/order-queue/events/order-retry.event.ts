import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class OrderRetryEvent extends DomainEvent {
  readonly eventName = 'order-queue.order.retry';

  constructor(
    public readonly queueItemId: string,
    public readonly attempt: number,
    public readonly reason: string,
    public readonly delayMs: number,
  ) {
    super();
  }
}
