import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { ReconciliationReport } from './models/reconciliation-report.model';
import { ManualReviewRequiredEvent } from './events';

/**
 * Never mutates trade or order state — its only job is to make an unsafe
 * mismatch visible: publish an event (picked up by the Audit subscriber
 * automatically, same as every other event in this system) and ensure the
 * persisted report is flagged so GET /reconciliation/report surfaces it.
 */
@Injectable()
export class ManualReviewService {
  constructor(@Inject(EVENT_BUS) private readonly eventBus: IEventBus) {}

  flagForReview(report: ReconciliationReport): ReconciliationReport {
    this.eventBus.publish(
      new ManualReviewRequiredEvent(
        report.tradeId,
        report.id,
        report.overallLevel,
      ),
    );
    return { ...report, manualReviewRequired: true };
  }
}
