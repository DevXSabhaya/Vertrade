import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class TrailingSLMovedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade.trailing-sl.moved';
  readonly eventName = TrailingSLMovedEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly previousStopLoss: number,
    public readonly newStopLoss: number,
  ) {
    super();
  }
}
