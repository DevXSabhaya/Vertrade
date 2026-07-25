import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class AutoRepairSucceededEvent extends DomainEvent {
  static readonly EVENT_NAME = 'reconciliation.auto-repair.succeeded';
  readonly eventName = AutoRepairSucceededEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly field: string,
  ) {
    super();
  }
}
