import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeatureFlagsModule } from '@core/feature-flags/feature-flags.module';
import { SettingsModule } from '@modules/settings/settings.module';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { MarketDataModule } from '@modules/market-data/market-data.module';
import { InstrumentMasterModule } from '@modules/instrument-master/instrument-master.module';
import { TradingEngineModule } from '@modules/trading-engine/trading-engine.module';
import { OrderQueueModule } from '@modules/order-queue/order-queue.module';
import { PositionReconciliationModule } from '@modules/position-reconciliation/position-reconciliation.module';
import { RiskManagementModule } from '@modules/risk-management/risk-management.module';
import { AuthModule } from '@modules/auth/auth.module';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import { NativeTimerScheduler } from '@shared/scheduler/native-timer-scheduler';
import { RecoveryStateMachine } from './state-machine/recovery-state-machine';
import { RecoverySnapshotService } from './recovery-snapshot.service';
import { RecoveryEventPublisher } from './recovery-event-publisher';
import { RecoveryCoordinator } from './recovery-coordinator.service';
import { RecoveryBootstrapService } from './recovery-bootstrap.service';
import { RecoveryScheduler } from './recovery-scheduler.service';
import { RecoveryService } from './recovery.service';
import { RecoveryController } from './recovery.controller';
import {
  DEFAULT_RECOVERY_CONFIG,
  type RecoveryConfig,
} from './models/recovery-config.model';
import {
  RECOVERY_CONFIG,
  RECOVERY_ERROR_REPOSITORY,
  RECOVERY_HISTORY_REPOSITORY,
  RECOVERY_SNAPSHOT_REPOSITORY,
} from './recovery.constants';
import {
  RecoveryHistoryDocumentSchema,
  RecoveryHistoryMongooseSchema,
} from './repository/recovery-history.schema';
import { RecoveryHistoryRepository } from './repository/recovery-history.repository';
import {
  RecoverySnapshotDocumentSchema,
  RecoverySnapshotMongooseSchema,
} from './repository/recovery-snapshot.schema';
import { RecoverySnapshotRepository } from './repository/recovery-snapshot.repository';
import {
  RecoveryErrorDocumentSchema,
  RecoveryErrorMongooseSchema,
} from './repository/recovery-error.schema';
import { RecoveryErrorRepository } from './repository/recovery-error.repository';

/**
 * The top-level orchestrator for Phase 9. Imports PositionReconciliationModule
 * (one-directional — see that module's own docstring) plus every module
 * whose state a full recovery cycle needs to touch. Never imports
 * SchedulerModule or BrokerHealthModule: those observe/trigger Recovery via
 * the Event Bus and their own HealthCheckJob/indicators, exactly like they
 * already do for each other (Phase 8's circular-dependency precedent).
 */
@Module({
  imports: [
    FeatureFlagsModule,
    SettingsModule,
    BrokerAuthModule,
    MarketDataModule,
    InstrumentMasterModule,
    TradingEngineModule,
    OrderQueueModule,
    PositionReconciliationModule,
    RiskManagementModule,
    AuthModule,
    MongooseModule.forFeature([
      {
        name: RecoveryHistoryDocumentSchema.name,
        schema: RecoveryHistoryMongooseSchema,
      },
      {
        name: RecoverySnapshotDocumentSchema.name,
        schema: RecoverySnapshotMongooseSchema,
      },
      {
        name: RecoveryErrorDocumentSchema.name,
        schema: RecoveryErrorMongooseSchema,
      },
    ]),
  ],
  controllers: [RecoveryController],
  providers: [
    RecoveryStateMachine,
    RecoverySnapshotService,
    RecoveryEventPublisher,
    RecoveryCoordinator,
    RecoveryBootstrapService,
    RecoveryScheduler,
    RecoveryService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: TIMER_SCHEDULER, useClass: NativeTimerScheduler },
    {
      provide: RECOVERY_CONFIG,
      useFactory: (): RecoveryConfig => DEFAULT_RECOVERY_CONFIG,
    },
    {
      provide: RECOVERY_HISTORY_REPOSITORY,
      useClass: RecoveryHistoryRepository,
    },
    {
      provide: RECOVERY_SNAPSHOT_REPOSITORY,
      useClass: RecoverySnapshotRepository,
    },
    { provide: RECOVERY_ERROR_REPOSITORY, useClass: RecoveryErrorRepository },
  ],
  exports: [RecoveryService, RecoveryCoordinator],
})
export class RecoveryModule {}
