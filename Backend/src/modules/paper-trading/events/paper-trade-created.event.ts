import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class PaperTradeCreatedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'paper-trading.trade.created';
  readonly eventName = PaperTradeCreatedEvent.EVENT_NAME;

  constructor(
    public readonly userId: string,
    public readonly tradeOwnershipId: string,
    public readonly rawSymbol: string,
  ) {
    super();
  }
}
