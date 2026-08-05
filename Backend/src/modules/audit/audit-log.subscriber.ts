import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
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
export class AuditLogSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditLogSubscriber.name);
  private readonly activeWrites = new Set<Promise<unknown>>();
  private destroyed = false;

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly repository: IAuditLogRepository,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribeToAll((event) => {
      const promise = this.handle(event);
      const task = promise
        .catch((error) => {
          if (this.destroyed) {
            return;
          }
          this.logger.error(
            `Failed to record audit log for event ${event.eventName}: ${error instanceof Error ? error.message : String(error)}`,
          );
        })
        .finally(() => {
          this.activeWrites.delete(task);
        });
      this.activeWrites.add(task);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    if (this.activeWrites.size > 0) {
      await Promise.all(Array.from(this.activeWrites));
    }
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
