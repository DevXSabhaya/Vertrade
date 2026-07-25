import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class TradeExitedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade.exited';
  readonly eventName = TradeExitedEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly exitOrderId: string,
    public readonly exitPrice: number,
    public readonly exitedQuantity: number,
  ) {
    super();
  }
}
