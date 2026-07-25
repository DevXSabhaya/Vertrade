import { EventCategory } from '@shared/enums/event-category.enum';
import { BaseEvent } from './base.event';

/**
 * An event describing something that happened inside a single bounded context
 * (e.g. a setting or feature flag changing). Not necessarily meant for
 * consumption outside this service.
 */
export abstract class DomainEvent extends BaseEvent {
  constructor(version = 1) {
    super(EventCategory.DOMAIN, version);
  }
}
