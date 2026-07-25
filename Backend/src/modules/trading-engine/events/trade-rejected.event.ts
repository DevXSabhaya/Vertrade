import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class TradeRejectedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade.rejected';
  readonly eventName = TradeRejectedEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly reason: string,
  ) {
    super();
  }
}
