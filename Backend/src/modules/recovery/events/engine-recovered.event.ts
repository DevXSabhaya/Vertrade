import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class EngineRecoveredEvent extends DomainEvent {
  static readonly EVENT_NAME = 'recovery.engine.recovered';
  readonly eventName = EngineRecoveredEvent.EVENT_NAME;

  constructor(
    public readonly recoveryId: string,
    public readonly tradeCount: number,
  ) {
    super();
  }
}
