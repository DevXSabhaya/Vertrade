import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { CooldownReason } from '../models/cooldown.model';

export class CooldownEndedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.cooldown.ended';
  readonly eventName = CooldownEndedEvent.EVENT_NAME;

  constructor(public readonly reason: CooldownReason) {
    super();
  }
}
