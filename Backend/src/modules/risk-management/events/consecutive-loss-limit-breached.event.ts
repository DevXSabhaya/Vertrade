import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class ConsecutiveLossLimitBreachedEvent extends DomainEvent {
  static readonly EVENT_NAME =
    'risk-management.consecutive-loss-limit.breached';
  readonly eventName = ConsecutiveLossLimitBreachedEvent.EVENT_NAME;

  constructor(
    public readonly consecutiveLosses: number,
    public readonly limit: number,
  ) {
    super();
  }
}
