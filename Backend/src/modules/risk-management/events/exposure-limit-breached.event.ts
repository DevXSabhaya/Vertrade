import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class ExposureLimitBreachedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.exposure-limit.breached';
  readonly eventName = ExposureLimitBreachedEvent.EVENT_NAME;

  constructor(
    public readonly rawSymbol: string,
    public readonly attemptedExposure: number,
    public readonly limit: number,
  ) {
    super();
  }
}
