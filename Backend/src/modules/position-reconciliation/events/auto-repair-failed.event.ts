import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class AutoRepairFailedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'reconciliation.auto-repair.failed';
  readonly eventName = AutoRepairFailedEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly field: string,
    public readonly reason: string,
  ) {
    super();
  }
}
