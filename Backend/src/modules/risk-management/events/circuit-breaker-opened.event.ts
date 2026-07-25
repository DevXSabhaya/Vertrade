import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { CircuitBreakerName } from '../models/circuit-breaker.model';

export class CircuitBreakerOpenedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.circuit-breaker.opened';
  readonly eventName = CircuitBreakerOpenedEvent.EVENT_NAME;

  constructor(
    public readonly breaker: CircuitBreakerName,
    public readonly consecutiveFailures: number,
  ) {
    super();
  }
}
