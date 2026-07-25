import { randomUUID } from 'node:crypto';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import {
  RISK_EVENT_REPOSITORY,
  RISK_VIOLATION_REPOSITORY,
} from './risk-management.constants';
import type { IRiskEventRepository } from './interfaces/risk-event-repository.interface';
import type { IRiskViolationRepository } from './interfaces/risk-violation-repository.interface';
import { TradeRiskRejectedEvent } from './events/trade-risk-rejected.event';

const RISK_EVENT_PREFIX = 'risk-management.';

/**
 * Subscribes to every risk-domain event (mirrors `AuditLogSubscriber`'s
 * `subscribeToAll` pattern, Phase 0) and persists a compact record of each
 * one — a dedicated, cheaply-queryable log distinct from the whole-system
 * audit log, backing `GET /risk/events`. `TradeRiskRejectedEvent` also gets
 * a second, structured `RiskViolation` record, backing `GET /risk/violations`.
 */
@Injectable()
export class RiskEventRecorderService implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(RISK_EVENT_REPOSITORY)
    private readonly eventRepository: IRiskEventRepository,
    @Inject(RISK_VIOLATION_REPOSITORY)
    private readonly violationRepository: IRiskViolationRepository,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribeToAll((event) => {
      void this.onAnyEvent(event);
    });
  }

  private async onAnyEvent(event: BaseEvent): Promise<void> {
    if (!event.eventName.startsWith(RISK_EVENT_PREFIX)) {
      return;
    }

    const tradeId = (event as unknown as { tradeId?: unknown }).tradeId;
    await this.eventRepository.save({
      id: randomUUID(),
      eventName: event.eventName,
      occurredAt: event.metadata.timestamp,
      correlationId: event.metadata.correlationId ?? null,
      tradeId: typeof tradeId === 'string' ? tradeId : null,
      payload: event as unknown as Record<string, unknown>,
    });

    if (event instanceof TradeRiskRejectedEvent) {
      await this.violationRepository.save({
        id: randomUUID(),
        occurredAt: event.metadata.timestamp,
        reasonCode: event.reasonCode,
        message: event.message,
        rawSymbol: event.rawSymbol,
        requestedQuantity: event.requestedQuantity,
        correlationId: event.metadata.correlationId ?? null,
      });
    }
  }
}
