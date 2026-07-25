import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
    // Phase 20 hardening: a generous global default (every route is
    // protected against basic abuse/DoS) — the genuinely sensitive
    // endpoints (login, register, forgot-password, OTP verify, trade
    // create/exit) additionally override this with much tighter
    // per-endpoint limits via `@Throttle()`. Keyed by IP by default
    // (ThrottlerGuard's default tracker), which is a separate dimension
    // from PasswordResetService's existing per-email cooldown — both apply.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
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
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
