import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class PositionOpenedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade-lifecycle.position.opened';
  readonly eventName = PositionOpenedEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly entryPrice: number,
    public readonly quantity: number,
  ) {
    super();
  }
}
