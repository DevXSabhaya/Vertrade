import { Module } from '@nestjs/common';
import { ConfigModule } from '@core/config/config.module';
import { SettingsModule } from '@modules/settings/settings.module';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { TradingModeService } from './trading-mode.service';

/**
 * Deliberately its own small module (not folded into `ConfigModule`, which
 * stays a pure, immutable env reader) — the one place a deployment's
 * *current* (persisted, switchable) trading mode is decided, separate from
 * `TRADING_MODE`'s role as only the boot-time default. Per Core Architecture
 * Principle #4, Trading Mode only changes Order Execution — this module
 * imports `BrokerAuthModule` (the broker session backing LIVE order
 * execution) but deliberately does NOT import `MarketDataModule` or
 * `InstrumentMasterModule`: those are wired to a single, trading-mode-
 * independent provider elsewhere, so there is nothing for this module to
 * orchestrate on their behalf.
 */
@Module({
  imports: [ConfigModule, SettingsModule, BrokerAuthModule],
  providers: [TradingModeService],
  exports: [TradingModeService],
})
export class TradingModeModule {}
