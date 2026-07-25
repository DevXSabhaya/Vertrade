import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { TradeDirection } from '../domain/trade-direction.enum';

export class TradeCreatedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade.created';
  readonly eventName = TradeCreatedEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly direction: TradeDirection,
    public readonly quantity: number,
    public readonly entryTriggerPrice: number,
    public readonly initialStopLoss: number,
    public readonly targets: readonly number[],
  ) {
    super();
  }
}
