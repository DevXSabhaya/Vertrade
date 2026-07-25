import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class EntryTriggeredEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade.entry.triggered';
  readonly eventName = EntryTriggeredEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly triggerPrice: number,
  ) {
    super();
  }
}
