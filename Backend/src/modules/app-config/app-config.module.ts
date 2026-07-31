import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { BrokerHealthModule } from '@modules/broker-health/broker-health.module';
import { InstrumentMasterModule } from '@modules/instrument-master/instrument-master.module';
import { TradingModeModule } from '@modules/trading-mode/trading-mode.module';
import { AppConfigController } from './app-config.controller';

/**
 * `AuthModule` is imported (not just `JwtAuthGuard` referenced via
 * `@UseGuards`) because Nest resolves a guard referenced by class token
 * against the *consuming* module's own DI graph — `AppConfigController`'s
 * `broker-status` route needs a direct path to `JwtService`/`UsersService`
 * too, not just to the guard's exported singleton. Same pattern
 * `PaperTradingModule` already uses (see `AuthModule`'s own docstring).
 */
@Module({
  imports: [
    AuthModule,
    BrokerAuthModule,
    BrokerHealthModule,
    InstrumentMasterModule,
    TradingModeModule,
  ],
  controllers: [AppConfigController],
})
export class AppConfigModule {}
