import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { OrderResponse } from '@modules/broker/executors/models/order-response.model';
import { REPAIR_ACTION_REPOSITORY } from './position-reconciliation.constants';
import type { IRepairActionRepository } from './interfaces/repair-action-repository.interface';
import { MismatchLevel } from './models/mismatch-level.enum';
import type { ReconciliationReport } from './models/reconciliation-report.model';
import type { LocalPositionView } from './models/local-position-view.model';
import type { BrokerPositionView } from './models/broker-position-view.model';
import { AutoRepairSucceededEvent, AutoRepairFailedEvent } from './events';

/**
 * The one and only mismatch this system ever repairs automatically: the
 * broker already confirmed an entry fill that the local trade never
 * recorded (the process crashed between the broker's response and the
 * local state update — the exact "crash after broker response" scenario).
 * Everything else — CRITICAL mismatches, or a fill the local side reports
 * that the broker doesn't corroborate — is never touched here; it is
 * ManualReviewService's job instead. "Repairing" means replaying the
 * broker's already-confirmed order response through the same
 * `applyEntryOrderResponse` command the live tick path uses — never placing
 * a new order, never guessing a value the broker didn't actually report.
 */
@Injectable()
export class AutoRepairService {
  constructor(
    private readonly tradingEngineService: TradingEngineService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(REPAIR_ACTION_REPOSITORY)
    private readonly repository: IRepairActionRepository,
  ) {}

  isSafeToRepair(report: ReconciliationReport): boolean {
    if (report.overallLevel === MismatchLevel.CRITICAL) {
      return false;
    }
    return report.mismatches.some(
      (m) => m.field === 'orderState' && m.level === MismatchLevel.ERROR,
    );
  }

  async repair(
    report: ReconciliationReport,
    local: LocalPositionView,
    broker: BrokerPositionView,
  ): Promise<ReconciliationReport> {
    if (
      !local.entryOrderId ||
      broker.entryOrderStatus === null ||
      broker.entryFilledQuantity === null
    ) {
      return report;
    }

    const previousValue = String(local.filledQuantity);
    const newValue = String(broker.entryFilledQuantity);

    try {
      this.tradingEngineService.applyRecoveredOrderResponse(
        local.tradeId,
        'ENTRY',
        new OrderResponse(
          local.entryOrderId,
          broker.entryOrderStatus,
          broker.entryFilledQuantity,
          broker.entryAveragePrice,
          this.clock.now(),
          'Applied during Position Reconciliation auto-repair',
        ),
      );

      await this.repository.save({
        id: randomUUID(),
        tradeId: local.tradeId,
        reportId: report.id,
        field: 'filledQuantity',
        previousValue,
        newValue,
        appliedAt: this.clock.now().toISOString(),
        succeeded: true,
        reason:
          'Broker-confirmed entry fill was missing locally; replayed via applyEntryOrderResponse.',
      });
      this.eventBus.publish(
        new AutoRepairSucceededEvent(local.tradeId, 'filledQuantity'),
      );
      return { ...report, autoRepaired: true, manualReviewRequired: false };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown repair failure';
      await this.repository.save({
        id: randomUUID(),
        tradeId: local.tradeId,
        reportId: report.id,
        field: 'filledQuantity',
        previousValue,
        newValue,
        appliedAt: this.clock.now().toISOString(),
        succeeded: false,
        reason,
      });
      this.eventBus.publish(
        new AutoRepairFailedEvent(local.tradeId, 'filledQuantity', reason),
      );
      return { ...report, manualReviewRequired: true };
    }
  }
}
