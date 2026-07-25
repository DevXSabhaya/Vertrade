import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { TradeState } from '../domain/trade-state.enum';

/**
 * Published for both the FAILED and ERROR terminal states — the frozen
 * architecture's domain event catalog defines a single TradeFailed event, not
 * a separate one per terminal failure state. `terminalState` lets a consumer
 * distinguish which one actually occurred.
 */
export class TradeFailedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade.failed';
  readonly eventName = TradeFailedEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly reason: string,
    public readonly terminalState: TradeState,
  ) {
    super();
  }
}
