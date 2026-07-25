import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { TradeState } from '../domain/trade-state.enum';

export class TradeRecoveredEvent extends DomainEvent {
  readonly eventName = 'trade.recovered';

  constructor(
    public readonly tradeId: string,
    public readonly resumedState: TradeState,
  ) {
    super();
  }
}
