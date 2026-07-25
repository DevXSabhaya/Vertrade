import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { CircuitBreakerName } from '../models/circuit-breaker.model';

export class CircuitBreakerHalfOpenedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.circuit-breaker.half-opened';
  readonly eventName = CircuitBreakerHalfOpenedEvent.EVENT_NAME;

  constructor(public readonly breaker: CircuitBreakerName) {
    super();
  }
}
