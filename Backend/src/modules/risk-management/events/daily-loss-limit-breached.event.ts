import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class DailyLossLimitBreachedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.daily-loss-limit.breached';
  readonly eventName = DailyLossLimitBreachedEvent.EVENT_NAME;

  constructor(
    public readonly realizedPnl: number,
    public readonly limit: number,
  ) {
    super();
  }
}
