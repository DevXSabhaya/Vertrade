import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { RiskSnapshot } from '../models/risk-snapshot.model';

export class TradeRiskApprovedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.trade.approved';
  readonly eventName = TradeRiskApprovedEvent.EVENT_NAME;

  constructor(
    public readonly rawSymbol: string,
    public readonly riskSnapshot: RiskSnapshot,
  ) {
    super();
  }
}
