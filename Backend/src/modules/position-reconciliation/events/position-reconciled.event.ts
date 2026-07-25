import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class PositionReconciledEvent extends DomainEvent {
  static readonly EVENT_NAME = 'reconciliation.position.reconciled';
  readonly eventName = PositionReconciledEvent.EVENT_NAME;

  constructor(
    public readonly tradeId: string,
    public readonly reportId: string,
  ) {
    super();
  }
}
