import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class TradeCancelledEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade.cancelled';
  readonly eventName = TradeCancelledEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly reason: string,
  ) {
    super();
  }
}
