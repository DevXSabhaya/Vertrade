import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class RecoverySnapshotSavedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'recovery.snapshot.saved';
  readonly eventName = RecoverySnapshotSavedEvent.EVENT_NAME;

  constructor(
    public readonly snapshotId: string,
    public readonly tradeCount: number,
    public readonly queueItemCount: number,
  ) {
    super();
  }
}
