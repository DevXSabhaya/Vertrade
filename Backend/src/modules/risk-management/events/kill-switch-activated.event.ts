import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { KillSwitchStatus } from '../models/kill-switch-status.enum';

export class KillSwitchActivatedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'risk-management.kill-switch.activated';
  readonly eventName = KillSwitchActivatedEvent.EVENT_NAME;

  constructor(
    public readonly status: KillSwitchStatus,
    public readonly reason: string,
    public readonly activatedBy: string,
  ) {
    super();
  }
}
