import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class FeatureFlagUpdatedEvent extends DomainEvent {
  readonly eventName = 'feature-flag.updated';

  constructor(
    public readonly name: string,
    public readonly enabled: boolean,
  ) {
    super();
  }
}
