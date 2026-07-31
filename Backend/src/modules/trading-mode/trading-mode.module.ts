import { Module } from '@nestjs/common';
import { ConfigModule } from '@core/config/config.module';
import { SettingsModule } from '@modules/settings/settings.module';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { MarketDataModule } from '@modules/market-data/market-data.module';
import { InstrumentMasterModule } from '@modules/instrument-master/instrument-master.module';
import { TradingModeService } from './trading-mode.service';

/**
 * Deliberately its own small module (not folded into `ConfigModule`, which
 * stays a pure, immutable env reader) — the one place a deployment's
 * *current* (persisted, switchable) trading mode is decided, separate from
 * `TRADING_MODE`'s role as only the boot-time default. Also the single
 * orchestrator of atomic PAPER/LIVE switching — imports MarketDataModule
 * and InstrumentMasterModule so it can drive their prepare/commit provider
 * switching directly. This is a one-directional dependency: neither of
 * those modules imports this one back (they don't need to — MarketDataService
 * /InstrumentMasterService default to a safe MOCK provider at their own
 * onModuleInit and are corrected by this module's OnApplicationBootstrap
 * hook), so there is no circular module dependency.
 */
@Module({
  imports: [
    ConfigModule,
    SettingsModule,
    BrokerAuthModule,
    MarketDataModule,
    InstrumentMasterModule,
  ],
  providers: [TradingModeService],
  exports: [TradingModeService],
})
export class TradingModeModule {}
