import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class UserRegisteredEvent extends DomainEvent {
  static readonly EVENT_NAME = 'users.user.registered';
  readonly eventName = UserRegisteredEvent.EVENT_NAME;

  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {
    super();
  }
}
