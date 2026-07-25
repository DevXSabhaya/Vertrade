import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class PaperAccountCreatedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'paper-account.account.created';
  readonly eventName = PaperAccountCreatedEvent.EVENT_NAME;

  constructor(
    public readonly userId: string,
    public readonly initialBalance: number,
  ) {
    super();
  }
}
