import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class OrderQueuedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'order-queue.order.queued';
  readonly eventName = OrderQueuedEvent.EVENT_NAME;

  constructor(
    public readonly queueItemId: string,
    public readonly idempotencyKey: string,
    public readonly wasDuplicate: boolean,
  ) {
    super();
  }
}
