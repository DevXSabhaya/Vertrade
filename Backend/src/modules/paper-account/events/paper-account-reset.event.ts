import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class PaperAccountResetEvent extends DomainEvent {
  static readonly EVENT_NAME = 'paper-account.account.reset';
  readonly eventName = PaperAccountResetEvent.EVENT_NAME;

  constructor(
    public readonly userId: string,
    public readonly newBalance: number,
  ) {
    super();
  }
}
