import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { TradingMode } from '@modules/trade-lifecycle/models/trade-record.model';

export class TradingModeChangedEvent extends DomainEvent {
  readonly eventName = 'trading-mode.changed';

  constructor(
    public readonly mode: TradingMode,
    public readonly previousMode: TradingMode,
    public readonly changedBy: string,
  ) {
    super();
  }
}
