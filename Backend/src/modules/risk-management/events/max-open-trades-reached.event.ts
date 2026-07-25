import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class MaxOpenTradesReachedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.max-open-trades.reached';
  readonly eventName = MaxOpenTradesReachedEvent.EVENT_NAME;

  constructor(
    public readonly openTradeCount: number,
    public readonly limit: number,
  ) {
    super();
  }
}
