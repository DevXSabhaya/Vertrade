import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { LocalPositionProvider } from './local-position.provider';
import { BrokerPositionProvider } from './broker-position.provider';
import { MismatchDetector } from './mismatch-detector';
import {
  MismatchLevel,
  MismatchLevelSeverity,
} from './models/mismatch-level.enum';
import type { ReconciliationReport } from './models/reconciliation-report.model';
import type { LocalPositionView } from './models/local-position-view.model';
import type { BrokerPositionView } from './models/broker-position-view.model';

const REQUIRES_MANUAL_REVIEW: ReadonlySet<MismatchLevel> = new Set([
  MismatchLevel.CRITICAL,
]);

export interface ReconciliationResult {
  readonly report: ReconciliationReport;
  readonly local: LocalPositionView;
  readonly broker: BrokerPositionView;
}

/**
 * Pure orchestration: for every open local position, fetches the broker's
 * view and runs MismatchDetector — produces raw ReconciliationReports with
 * no repair/persistence side effects (those belong to AutoRepairService /
 * ManualReviewService / ReconciliationReporter, kept separate on purpose).
 */
@Injectable()
export class ReconciliationEngine {
  private readonly logger = new Logger(ReconciliationEngine.name);

  constructor(
    private readonly localPositionProvider: LocalPositionProvider,
    private readonly brokerPositionProvider: BrokerPositionProvider,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async run(): Promise<ReconciliationResult[]> {
    const positions = this.localPositionProvider.getOpenPositions();
    const results: ReconciliationResult[] = [];

    for (const local of positions) {
      // One trade's broker lookup failing (broker unavailable, a single bad
      // order id, a transient timeout) must never abort reconciliation for
      // every other open trade — each trade is reconciled independently.
      try {
        const broker = await this.brokerPositionProvider.fetch(local);
        const mismatches = MismatchDetector.detect(local, broker);
        const overallLevel = MismatchLevelSeverity.mostSevere(
          mismatches.map((m) => m.level),
        );

        const report: ReconciliationReport = {
          id: randomUUID(),
          tradeId: local.tradeId,
          generatedAt: this.clock.now().toISOString(),
          mismatches,
          overallLevel,
          autoRepaired: false,
          manualReviewRequired: REQUIRES_MANUAL_REVIEW.has(overallLevel),
        };
        results.push({ report, local, broker });
      } catch (error) {
        this.logger.warn(
          `Skipping reconciliation for trade ${local.tradeId}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }

    return results;
  }
}
