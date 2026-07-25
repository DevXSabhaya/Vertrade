import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class UserLoggedInEvent extends DomainEvent {
  static readonly EVENT_NAME = 'users.user.logged-in';
  readonly eventName = UserLoggedInEvent.EVENT_NAME;

  constructor(public readonly userId: string) {
    super();
  }
}
