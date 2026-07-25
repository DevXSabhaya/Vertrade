import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { AuditLogEntry } from './audit-log-entry.entity';
import { AUDIT_LOG_REPOSITORY } from './audit.constants';
import type { IAuditLogRepository } from './interfaces/audit-log-repository.interface';

/**
 * Subscribes to every event on the bus and persists an immutable audit
 * record. Nothing calls this directly — it is the sole consumer of the
 * wildcard event stream for audit purposes.
 */
@Injectable()
export class AuditLogSubscriber implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly repository: IAuditLogRepository,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribeToAll((event) => this.handle(event));
  }

  private async handle(event: BaseEvent): Promise<void> {
    const entry = new AuditLogEntry(
      event.eventName,
      event.metadata.timestamp,
      event.metadata.correlationId,
      event,
    );
    await this.repository.record(entry);
  }
}
