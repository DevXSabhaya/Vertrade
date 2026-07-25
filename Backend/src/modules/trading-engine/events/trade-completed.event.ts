import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class TradeCompletedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade.completed';
  readonly eventName = TradeCompletedEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly realizedPnl: number,
  ) {
    super();
  }
}
