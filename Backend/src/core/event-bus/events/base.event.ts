import { EventCategory } from '@shared/enums/event-category.enum';
import { CorrelationIdStore } from '../../correlation/correlation-id.store';

export interface EventMetadata {
  correlationId?: string;
  timestamp: string;
  version: number;
  category: EventCategory;
}

/**
 * Every event in the system inherits from this base, guaranteeing a consistent
 * name/version/timestamp/correlationId shape regardless of which concrete
 * event bus implementation (in-process today, Redis/Kafka later) carries it.
 */
export abstract class BaseEvent {
  abstract readonly eventName: string;
  readonly metadata: EventMetadata;

  protected constructor(category: EventCategory, version = 1) {
    this.metadata = {
      correlationId: CorrelationIdStore.getId(),
      timestamp: new Date().toISOString(),
      version,
      category,
    };
  }
}
