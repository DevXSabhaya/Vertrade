import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class QueueRecoveredEvent extends DomainEvent {
  static readonly EVENT_NAME = 'recovery.queue.recovered';
  readonly eventName = QueueRecoveredEvent.EVENT_NAME;

  constructor(
    public readonly recoveryId: string,
    public readonly itemCount: number,
  ) {
    super();
  }
}
