import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class RecoveryCompletedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'recovery.completed';
  readonly eventName = RecoveryCompletedEvent.EVENT_NAME;

  constructor(
    public readonly recoveryId: string,
    public readonly durationMs: number,
    public readonly tradesRecovered: number,
    public readonly queueItemsRecovered: number,
  ) {
    super();
  }
}
