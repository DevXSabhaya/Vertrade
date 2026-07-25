import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { ReconciliationEngine } from './reconciliation-engine.service';
import { AutoRepairService } from './auto-repair.service';
import { ManualReviewService } from './manual-review.service';
import { ReconciliationReporter } from './reconciliation-reporter.service';
import { MismatchLevel } from './models/mismatch-level.enum';
import type { ReconciliationReport } from './models/reconciliation-report.model';
import {
  PositionMismatchDetectedEvent,
  PositionReconciledEvent,
} from './events';

/**
 * The single entry point for Position Reconciliation (Part 7 of the Phase 9
 * spec): runs the comparison for every open trade, routes each report to
 * auto-repair or manual review as appropriate, persists it, and publishes
 * the outcome — this is the only class RecoveryCoordinator (and
 * POST /reconciliation/run) ever calls into.
 */
@Injectable()
export class PositionReconciliationService {
  constructor(
    private readonly engine: ReconciliationEngine,
    private readonly autoRepairService: AutoRepairService,
    private readonly manualReviewService: ManualReviewService,
    private readonly reporter: ReconciliationReporter,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async reconcile(): Promise<ReconciliationReport[]> {
    const results = await this.engine.run();
    const finalReports: ReconciliationReport[] = [];

    for (const { report, local, broker } of results) {
      let finalReport = report;

      if (report.overallLevel !== MismatchLevel.NO_DIFFERENCE) {
        this.eventBus.publish(
          new PositionMismatchDetectedEvent(
            report.tradeId,
            report.overallLevel,
            report.mismatches.filter(
              (m) => m.level !== MismatchLevel.NO_DIFFERENCE,
            ).length,
          ),
        );
      }

      if (this.autoRepairService.isSafeToRepair(report)) {
        finalReport = await this.autoRepairService.repair(
          report,
          local,
          broker,
        );
      } else if (report.manualReviewRequired) {
        finalReport = this.manualReviewService.flagForReview(report);
      }

      await this.reporter.persist(finalReport);
      this.eventBus.publish(
        new PositionReconciledEvent(finalReport.tradeId, finalReport.id),
      );
      finalReports.push(finalReport);
    }

    return finalReports;
  }

  async getLatestReport(): Promise<ReconciliationReport | null> {
    return this.reporter.getLatest();
  }

  async getHistory(limit = 50): Promise<ReconciliationReport[]> {
    return this.reporter.getHistory(limit);
  }
}
