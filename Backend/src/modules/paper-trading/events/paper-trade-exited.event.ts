import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class PaperTradeExitedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'paper-trading.trade.exited';
  readonly eventName = PaperTradeExitedEvent.EVENT_NAME;

  constructor(
    public readonly userId: string,
    public readonly tradeOwnershipId: string,
    public readonly tradeId: string,
  ) {
    super();
  }
}
