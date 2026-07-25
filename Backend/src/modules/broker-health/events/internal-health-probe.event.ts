import { DomainEvent } from '@core/event-bus/events/domain-event.base';

/** Purely internal round-trip self-test for EventBusHealthIndicator — never
 * observed or reacted to by any other module. */
export class InternalHealthProbeEvent extends DomainEvent {
  static readonly EVENT_NAME = 'broker-health.internal.probe';
  readonly eventName = InternalHealthProbeEvent.EVENT_NAME;

  constructor(public readonly probeId: string) {
    super();
  }
}
