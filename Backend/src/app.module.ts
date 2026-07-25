import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@core/config/config.module';
import { ConfigService } from '@core/config/config.service';
import { LoggerModule } from '@core/logger/logger.module';
import { HealthModule } from '@modules/health/health.module';
import { CorrelationIdModule } from '@core/correlation/correlation-id.module';
import { EventBusModule } from '@core/event-bus/event-bus.module';
import { FeatureFlagsModule } from '@core/feature-flags/feature-flags.module';
import { SettingsModule } from '@modules/settings/settings.module';
import { AuditModule } from '@modules/audit/audit.module';
import { LogsModule } from '@modules/logs/logs.module';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { InstrumentMasterModule } from '@modules/instrument-master/instrument-master.module';
import { InstrumentResolverModule } from '@modules/instrument-resolver/instrument-resolver.module';
import { ExecutorsModule } from '@modules/broker/executors/executors.module';
import { TradingEngineModule } from '@modules/trading-engine/trading-engine.module';
import { MarketDataModule } from '@modules/market-data/market-data.module';
import { TradeValidationModule } from '@modules/trade-validation/trade-validation.module';
import { OrderQueueModule } from '@modules/order-queue/order-queue.module';
import { BrokerHealthModule } from '@modules/broker-health/broker-health.module';
import { SchedulerModule } from '@modules/scheduler/scheduler.module';
import { PositionReconciliationModule } from '@modules/position-reconciliation/position-reconciliation.module';
import { RecoveryModule } from '@modules/recovery/recovery.module';
import { TradeLifecycleModule } from '@modules/trade-lifecycle/trade-lifecycle.module';
import { RiskManagementModule } from '@modules/risk-management/risk-management.module';
import { UsersModule } from '@modules/users/users.module';
import { AuthModule } from '@modules/auth/auth.module';
import { PaperAccountModule } from '@modules/paper-account/paper-account.module';
import { PaperTradingModule } from '@modules/paper-trading/paper-trading.module';
import { AppConfigModule } from '@modules/app-config/app-config.module';
import { RealtimeModule } from '@modules/realtime/realtime.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    CorrelationIdModule,
    EventBusModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.mongodbUri,
        serverSelectionTimeoutMS: 5000,
      }),
    }),
    FeatureFlagsModule,
    SettingsModule,
    AuditModule,
    LogsModule,
    BrokerAuthModule,
    InstrumentMasterModule,
    InstrumentResolverModule,
    ExecutorsModule,
    TradingEngineModule,
    MarketDataModule,
    TradeValidationModule,
    OrderQueueModule,
    BrokerHealthModule,
    SchedulerModule,
    PositionReconciliationModule,
    RecoveryModule,
    TradeLifecycleModule,
    RiskManagementModule,
    UsersModule,
    AuthModule,
    PaperAccountModule,
    PaperTradingModule,
    HealthModule,
    AppConfigModule,
    RealtimeModule,
  ],
})
export class AppModule {}
