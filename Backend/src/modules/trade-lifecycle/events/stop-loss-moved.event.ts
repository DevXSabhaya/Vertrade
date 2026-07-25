import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { TrailingStrategy } from '../models/trailing-strategy.enum';

/**
 * Distinct from Trading Engine's own `TrailingSLMovedEvent` (Phase 5's
 * always-on, per-target trailing rule) — this fires specifically when
 * `TrailingManager`'s configurable strategy is what moved the stop loss,
 * carrying which strategy did it. Both events fire for the same underlying
 * `Trade.moveStopLoss()` call; a consumer that only cares about "the stop
 * loss changed" can subscribe to either.
 */
export class StopLossMovedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade-lifecycle.stop-loss.moved';
  readonly eventName = StopLossMovedEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly previousStopLoss: number,
    public readonly newStopLoss: number,
    public readonly strategy: TrailingStrategy,
  ) {
    super();
  }
}
