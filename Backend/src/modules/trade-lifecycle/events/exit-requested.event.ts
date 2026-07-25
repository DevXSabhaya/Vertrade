import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { ExitReason } from '../models/exit-reason.enum';

export class ExitRequestedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'trade-lifecycle.exit.requested';
  readonly eventName = ExitRequestedEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly quantity: number,
    public readonly reason: ExitReason,
  ) {
    super();
  }
}
