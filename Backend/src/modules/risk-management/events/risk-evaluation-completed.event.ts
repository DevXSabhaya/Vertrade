import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { RiskDecision } from '../models/risk-decision.model';

export class RiskEvaluationCompletedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.evaluation.completed';
  readonly eventName = RiskEvaluationCompletedEvent.EVENT_NAME;

  constructor(
    public readonly rawSymbol: string,
    public readonly decision: RiskDecision,
  ) {
    super();
  }
}
