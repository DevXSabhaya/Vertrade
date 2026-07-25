import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class SettingUpdatedEvent extends DomainEvent {
  readonly eventName = 'setting.updated';

  constructor(
    public readonly key: string,
    public readonly value: unknown,
  ) {
    super();
  }
}
