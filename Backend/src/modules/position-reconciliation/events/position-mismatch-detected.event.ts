import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { MismatchLevel } from '../models/mismatch-level.enum';

export class PositionMismatchDetectedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'reconciliation.mismatch.detected';
  readonly eventName = PositionMismatchDetectedEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly overallLevel: MismatchLevel,
    public readonly mismatchCount: number,
  ) {
    super();
  }
}
