import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { TradingEngineModule } from '@modules/trading-engine/trading-engine.module';
import { ExecutorsModule } from '@modules/broker/executors/executors.module';
import { LocalPositionProvider } from './local-position.provider';
import { BrokerPositionProvider } from './broker-position.provider';
import { ReconciliationEngine } from './reconciliation-engine.service';
import { AutoRepairService } from './auto-repair.service';
import { ManualReviewService } from './manual-review.service';
import { ReconciliationReporter } from './reconciliation-reporter.service';
import { PositionReconciliationService } from './position-reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import {
  RECONCILIATION_REPORT_REPOSITORY,
  REPAIR_ACTION_REPOSITORY,
} from './position-reconciliation.constants';
import {
  ReconciliationReportDocumentSchema,
  ReconciliationReportMongooseSchema,
} from './repository/reconciliation-report.schema';
import { ReconciliationReportRepository } from './repository/reconciliation-report.repository';
import {
  RepairActionDocumentSchema,
  RepairActionMongooseSchema,
} from './repository/repair-action.schema';
import { RepairActionRepository } from './repository/repair-action.repository';

/**
 * Deliberately never imports RecoveryModule — RecoveryCoordinator's
 * "Verify Positions" step calls into this module (a one-directional
 * dependency), never the reverse.
 */
@Module({
  imports: [
    TradingEngineModule,
    ExecutorsModule,
    MongooseModule.forFeature([
      {
        name: ReconciliationReportDocumentSchema.name,
        schema: ReconciliationReportMongooseSchema,
      },
      {
        name: RepairActionDocumentSchema.name,
        schema: RepairActionMongooseSchema,
      },
    ]),
  ],
  controllers: [ReconciliationController],
  providers: [
    LocalPositionProvider,
    BrokerPositionProvider,
    ReconciliationEngine,
    AutoRepairService,
    ManualReviewService,
    ReconciliationReporter,
    PositionReconciliationService,
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: RECONCILIATION_REPORT_REPOSITORY,
      useClass: ReconciliationReportRepository,
    },
    { provide: REPAIR_ACTION_REPOSITORY, useClass: RepairActionRepository },
  ],
  exports: [PositionReconciliationService],
})
export class PositionReconciliationModule {}
