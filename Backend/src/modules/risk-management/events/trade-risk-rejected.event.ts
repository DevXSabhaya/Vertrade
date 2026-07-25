import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { RiskReasonCode } from '../models/risk-reason-code.enum';
import type { RiskSnapshot } from '../models/risk-snapshot.model';

export class TradeRiskRejectedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.trade.rejected';
  readonly eventName = TradeRiskRejectedEvent.EVENT_NAME;

  constructor(
    public readonly rawSymbol: string,
    public readonly requestedQuantity: number,
    public readonly reasonCode: RiskReasonCode,
    public readonly message: string,
    public readonly riskSnapshot: RiskSnapshot,
  ) {
    super();
  }
}
