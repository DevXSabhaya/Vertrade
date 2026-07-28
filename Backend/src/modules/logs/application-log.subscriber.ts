import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { LoggerService } from '@core/logger/logger.service';

/**
 * Subscribes to every event on the bus and writes an application-level log
 * line. Kept entirely separate from AuditLogSubscriber — this is a debugging
 * aid, not the immutable audit trail.
 */
@Injectable()
export class ApplicationLogSubscriber implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribeToAll((event) => this.handle(event));
  }

  private handle(event: BaseEvent): void {
    this.logger.log(
      JSON.stringify({ eventName: event.eventName, ...event.metadata }),
      'ApplicationLog',
    );
  }
}
