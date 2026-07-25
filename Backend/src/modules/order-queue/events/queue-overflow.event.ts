import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class QueueOverflowEvent extends DomainEvent {
  readonly eventName = 'order-queue.queue.overflow';

  constructor(
    public readonly queueSize: number,
    public readonly maxQueueSize: number,
  ) {
    super();
  }
}
