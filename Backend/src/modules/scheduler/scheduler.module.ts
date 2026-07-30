import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@core/config/config.module';
import { ConfigService } from '@core/config/config.service';
import { FeatureFlagsModule } from '@core/feature-flags/feature-flags.module';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { InstrumentMasterModule } from '@modules/instrument-master/instrument-master.module';
import { MarketDataModule } from '@modules/market-data/market-data.module';
import { OrderQueueModule } from '@modules/order-queue/order-queue.module';
import { TradingEngineModule } from '@modules/trading-engine/trading-engine.module';
import { TradeLifecycleModule } from '@modules/trade-lifecycle/trade-lifecycle.module';
import { BrokerHealthModule } from '@modules/broker-health/broker-health.module';
import { RiskManagementModule } from '@modules/risk-management/risk-management.module';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import { NativeTimerScheduler } from '@shared/scheduler/native-timer-scheduler';
import { SchedulerService } from './scheduler.service';
import { JobRegistry } from './job-registry';
import { SchedulerMetricsService } from './metrics/scheduler-metrics.service';
import { MorningStartupJob } from './jobs/morning-startup.job';
import { MarketCloseJob } from './jobs/market-close.job';
import { HealthCheckJob } from './jobs/health-check.job';
import { InstrumentRefreshJob } from './jobs/instrument-refresh.job';
import { CleanupJob } from './jobs/cleanup.job';
import { RiskMaintenanceJob } from './jobs/risk-maintenance.job';
import {
  SchedulerHistoryDocumentSchema,
  SchedulerHistoryMongooseSchema,
} from './repository/scheduler-history.schema';
import { SchedulerHistoryRepository } from './repository/scheduler-history.repository';
import {
  SCHEDULED_JOBS,
  SCHEDULER_CONFIG,
  SCHEDULER_HISTORY_REPOSITORY,
} from './scheduler.constants';
import {
  DEFAULT_SCHEDULER_CONFIG,
  type SchedulerConfig,
} from './models/scheduler-config.model';
import type { IScheduledJob } from './interfaces/scheduled-job.interface';

const JOB_PROVIDERS = [
  MorningStartupJob,
  MarketCloseJob,
  HealthCheckJob,
  InstrumentRefreshJob,
  CleanupJob,
  RiskMaintenanceJob,
];

/**
 * Automates every platform lifecycle operation. Depends on BrokerHealthModule
 * (for HealthCheckJob) — this is the only correct direction: BrokerHealthModule
 * must never depend back on SchedulerModule (see SchedulerHealthIndicator).
 */
@Module({
  imports: [
    ConfigModule,
    FeatureFlagsModule,
    BrokerAuthModule,
    InstrumentMasterModule,
    MarketDataModule,
    OrderQueueModule,
    TradingEngineModule,
    TradeLifecycleModule,
    BrokerHealthModule,
    RiskManagementModule,
    MongooseModule.forFeature([
      {
        name: SchedulerHistoryDocumentSchema.name,
        schema: SchedulerHistoryMongooseSchema,
      },
    ]),
  ],
  providers: [
    ...JOB_PROVIDERS,
    JobRegistry,
    SchedulerMetricsService,
    SchedulerService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: TIMER_SCHEDULER, useClass: NativeTimerScheduler },
    {
      provide: SCHEDULER_HISTORY_REPOSITORY,
      useClass: SchedulerHistoryRepository,
    },
    {
      provide: SCHEDULER_CONFIG,
      useFactory: (configService: ConfigService): SchedulerConfig => ({
        ...DEFAULT_SCHEDULER_CONFIG,
        healthCheckIntervalMs: configService.healthCheckIntervalMs,
        marketOpenTime: configService.marketOpenTime,
        marketCloseTime: configService.marketCloseTime,
      }),
      inject: [ConfigService],
    },
    {
      provide: SCHEDULED_JOBS,
      useFactory: (...jobs: IScheduledJob[]): IScheduledJob[] => jobs,
      inject: JOB_PROVIDERS,
    },
  ],
  exports: [SchedulerService],
})
export class SchedulerModule {}
