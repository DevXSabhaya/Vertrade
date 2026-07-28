import { Module } from '@nestjs/common';
import { ConfigModule } from '@core/config/config.module';
import { SettingsModule } from '@modules/settings/settings.module';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { TradingModeService } from './trading-mode.service';

/**
 * Deliberately its own small module (not folded into `ConfigModule`, which
 * stays a pure, immutable env reader) — the one place a deployment's
 * *current* (persisted, switchable) trading mode is decided, separate from
 * `TRADING_MODE`'s role as only the boot-time default.
 */
@Module({
  imports: [ConfigModule, SettingsModule, BrokerAuthModule],
  providers: [TradingModeService],
  exports: [TradingModeService],
})
export class TradingModeModule {}
