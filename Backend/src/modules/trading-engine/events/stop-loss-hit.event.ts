import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class StopLossHitEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade.stop-loss.hit';
  readonly eventName = StopLossHitEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly price: number,
    public readonly stopLossPrice: number,
  ) {
    super();
  }
}
