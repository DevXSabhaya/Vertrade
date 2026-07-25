import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { CooldownReason } from '../models/cooldown.model';

export class CooldownStartedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.cooldown.started';
  readonly eventName = CooldownStartedEvent.EVENT_NAME;

  constructor(
    public readonly reason: CooldownReason,
    public readonly expiresAt: string,
  ) {
    super();
  }
}
