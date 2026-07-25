import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class RiskEvaluationStartedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.evaluation.started';
  readonly eventName = RiskEvaluationStartedEvent.EVENT_NAME;

  constructor(public readonly rawSymbol: string) {
    super();
  }
}
