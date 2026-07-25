import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { MismatchLevel } from '../models/mismatch-level.enum';

export class ManualReviewRequiredEvent extends DomainEvent {
  static readonly EVENT_NAME = 'reconciliation.manual-review.required';
  readonly eventName = ManualReviewRequiredEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly reportId: string,
    public readonly overallLevel: MismatchLevel,
  ) {
    super();
  }
}
