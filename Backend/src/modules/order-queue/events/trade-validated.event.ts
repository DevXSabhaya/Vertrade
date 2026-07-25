import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class TradeValidatedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'order-queue.trade.validated';
  readonly eventName = TradeValidatedEvent.EVENT_NAME;

  constructor(
    public readonly idempotencyKey: string,
    public readonly instrumentToken: string,
  ) {
    super();
  }
}
