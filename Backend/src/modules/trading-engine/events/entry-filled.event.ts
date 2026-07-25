import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class EntryFilledEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade.entry.filled';
  readonly eventName = EntryFilledEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly entryOrderId: string,
    public readonly fillPrice: number,
    public readonly filledQuantity: number,
  ) {
    super();
  }
}
