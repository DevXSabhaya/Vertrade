import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { CircuitBreakerName } from '../models/circuit-breaker.model';

export class CircuitBreakerClosedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.circuit-breaker.closed';
  readonly eventName = CircuitBreakerClosedEvent.EVENT_NAME;

  constructor(public readonly breaker: CircuitBreakerName) {
    super();
  }
}
