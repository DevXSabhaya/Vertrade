import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { HealthSnapshot } from '../models/health-snapshot.model';

export class HealthSnapshotUpdatedEvent extends DomainEvent {
  readonly eventName = 'broker-health.snapshot.updated';

  constructor(public readonly snapshot: HealthSnapshot) {
    super();
  }
}
