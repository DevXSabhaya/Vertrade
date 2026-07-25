import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@core/config/config.module';
import { ConfigService } from '@core/config/config.service';
import { FeatureFlagsModule } from '@core/feature-flags/feature-flags.module';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { MarketDataModule } from '@modules/market-data/market-data.module';
import { InstrumentMasterModule } from '@modules/instrument-master/instrument-master.module';
import { OrderQueueModule } from '@modules/order-queue/order-queue.module';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import { NativeTimerScheduler } from '@shared/scheduler/native-timer-scheduler';
import { HTTP_CLIENT } from '@shared/http/http-client.constants';
import { FetchHttpClient } from '@shared/http/fetch-http-client';
import { BrokerHealthService } from './broker-health.service';
import { HealthAggregatorService } from './aggregator/health-aggregator.service';
import { HeartbeatMonitorService } from './heartbeat/heartbeat-monitor.service';
import { RecoveryManagerService } from './recovery/recovery-manager.service';
import { BrokerHealthMetricsService } from './metrics/broker-health-metrics.service';
import {
  DEFAULT_INTERNET_CHECK_URL,
  HEALTH_INDICATORS,
  HEALTH_MONITOR_CONFIG,
  HEALTH_SNAPSHOT_REPOSITORY,
  INTERNET_CHECK_URL,
  RECOVERY_HISTORY_REPOSITORY,
} from './broker-health.constants';
import type { HealthMonitorConfig } from './models/health-monitor-config.model';
import type { IHealthIndicator } from './interfaces/health-indicator.interface';
import { BrokerAuthHealthIndicator } from './indicators/broker-auth.health-indicator';
import { RestApiHealthIndicator } from './indicators/rest-api.health-indicator';
import { OrderApiHealthIndicator } from './indicators/order-api.health-indicator';
import { WebSocketHealthIndicator } from './indicators/websocket.health-indicator';
import { MarketDataProviderHealthIndicator } from './indicators/market-data-provider.health-indicator';
import { InstrumentMasterHealthIndicator } from './indicators/instrument-master.health-indicator';
import { InternetConnectivityHealthIndicator } from './indicators/internet-connectivity.health-indicator';
import { DatabaseConnectivityHealthIndicator } from './indicators/database-connectivity.health-indicator';
import { EventBusHealthIndicator } from './indicators/event-bus.health-indicator';
import { SchedulerHealthIndicator } from './indicators/scheduler.health-indicator';
import { OrderQueueHealthIndicator } from './indicators/order-queue.health-indicator';
import {
  HealthSnapshotDocumentSchema,
  HealthSnapshotMongooseSchema,
} from './repository/health-snapshot.schema';
import { HealthSnapshotRepository } from './repository/health-snapshot.repository';
import {
  RecoveryHistoryDocumentSchema,
  RecoveryHistoryMongooseSchema,
} from './repository/recovery-history.schema';
import { RecoveryHistoryRepository } from './repository/recovery-history.repository';

const INDICATOR_PROVIDERS = [
  BrokerAuthHealthIndicator,
  RestApiHealthIndicator,
  OrderApiHealthIndicator,
  WebSocketHealthIndicator,
  MarketDataProviderHealthIndicator,
  InstrumentMasterHealthIndicator,
  InternetConnectivityHealthIndicator,
  DatabaseConnectivityHealthIndicator,
  EventBusHealthIndicator,
  SchedulerHealthIndicator,
  OrderQueueHealthIndicator,
];

/**
 * The single source of truth for broker health. Deliberately never imports
 * SchedulerModule (the Scheduler's own HealthCheckJob depends on this module
 * instead — see SchedulerHealthIndicator's docstring for why the reverse
 * dependency would be circular).
 */
@Module({
  imports: [
    ConfigModule,
    FeatureFlagsModule,
    BrokerAuthModule,
    MarketDataModule,
    InstrumentMasterModule,
    OrderQueueModule,
    MongooseModule.forFeature([
      {
        name: HealthSnapshotDocumentSchema.name,
        schema: HealthSnapshotMongooseSchema,
      },
      {
        name: RecoveryHistoryDocumentSchema.name,
        schema: RecoveryHistoryMongooseSchema,
      },
    ]),
  ],
  providers: [
    ...INDICATOR_PROVIDERS,
    HealthAggregatorService,
    HeartbeatMonitorService,
    RecoveryManagerService,
    BrokerHealthMetricsService,
    BrokerHealthService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: TIMER_SCHEDULER, useClass: NativeTimerScheduler },
    { provide: HTTP_CLIENT, useClass: FetchHttpClient },
    { provide: INTERNET_CHECK_URL, useValue: DEFAULT_INTERNET_CHECK_URL },
    { provide: HEALTH_SNAPSHOT_REPOSITORY, useClass: HealthSnapshotRepository },
    {
      provide: RECOVERY_HISTORY_REPOSITORY,
      useClass: RecoveryHistoryRepository,
    },
    {
      provide: HEALTH_MONITOR_CONFIG,
      useFactory: (configService: ConfigService): HealthMonitorConfig => ({
        healthCheckIntervalMs: configService.healthCheckIntervalMs,
        heartbeatTimeoutMs: configService.heartbeatTimeoutMs,
        retryCount: 3,
        reconnectBaseDelayMs: 1_000,
        reconnectMaxDelayMs: 30_000,
        reconnectJitterRatio: 0.2,
        brokerTimeoutMs: 10_000,
        instrumentFreshnessThresholdMs: 24 * 60 * 60 * 1000,
        maintenanceMode: configService.maintenanceMode,
      }),
      inject: [ConfigService],
    },
    {
      provide: HEALTH_INDICATORS,
      useFactory: (...indicators: IHealthIndicator[]): IHealthIndicator[] =>
        indicators,
      inject: INDICATOR_PROVIDERS,
    },
  ],
  exports: [BrokerHealthService, BrokerHealthMetricsService],
})
export class BrokerHealthModule {}
