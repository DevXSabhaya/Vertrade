import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { ExitReason } from '../models/exit-reason.enum';

/** Fires whenever a trade's open quantity reaches zero, regardless of the final trade status — PositionManager's single signal to evict a trade from its active cache. */
export class PositionClosedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade-lifecycle.position.closed';
  readonly eventName = PositionClosedEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly reason: ExitReason | null,
    public readonly realizedPnl: number | null,
  ) {
    super();
  }
}
