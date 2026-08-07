import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@core/config/config.module';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { BrokerAccountModule } from '@modules/broker/broker-account/broker-account.module';
import {
  UserTradingPreferenceDocumentSchema,
  UserTradingPreferenceMongooseSchema,
} from './schema/user-trading-preference.schema';
import { UserTradingPreferenceRepository } from './repository/user-trading-preference.repository';
import { USER_TRADING_PREFERENCE_REPOSITORY } from './trading-mode.constants';
import { TradingModeService } from './trading-mode.service';

/**
 * Deliberately its own small module (not folded into `ConfigModule`, which
 * stays a pure, immutable env reader) — the one place a user's *current*
 * (persisted, switchable) trading mode and selected broker are decided,
 * separate from `TRADING_MODE`'s role as only the boot-time default for
 * users who've never set a preference. Per Core Architecture Principle #4,
 * Trading Mode only changes Order Execution — this module imports
 * `BrokerAuthModule` (per-account broker sessions backing LIVE order
 * execution) and `BrokerAccountModule` (the per-user broker-account catalog
 * a LIVE switch validates against) but deliberately does NOT import
 * `MarketDataModule` or `InstrumentMasterModule`: those are wired to a
 * single, trading-mode-independent provider elsewhere.
 */
@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      {
        name: UserTradingPreferenceDocumentSchema.name,
        schema: UserTradingPreferenceMongooseSchema,
      },
    ]),
    BrokerAuthModule,
    BrokerAccountModule,
  ],
  providers: [
    {
      provide: USER_TRADING_PREFERENCE_REPOSITORY,
      useClass: UserTradingPreferenceRepository,
    },
    TradingModeService,
  ],
  exports: [TradingModeService],
})
export class TradingModeModule {}
