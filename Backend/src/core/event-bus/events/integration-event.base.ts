import { EventCategory } from '@shared/enums/event-category.enum';
import { BaseEvent } from './base.event';

/**
 * An event meant to cross module or system boundaries (e.g. notifying an
 * external channel, or a future message-queue publication). Distinguishing
 * this from DomainEvent lets subscribers filter by category without needing
 * to know every concrete event type in advance.
 */
export abstract class IntegrationEvent extends BaseEvent {
  constructor(version = 1) {
    super(EventCategory.INTEGRATION, version);
  }
}
