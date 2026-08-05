import { Module } from '@nestjs/common';
import { ConfigService } from '@core/config/config.service';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import { NativeTimerScheduler } from '@shared/scheduler/native-timer-scheduler';
import { MarketDataService } from './market-data.service';
import { MarketDataCredentialProvider } from './market-data-credential.provider';
import { SubscriptionManager } from './subscription/subscription-manager';
import {
  MOCK_MARKET_DATA_PROVIDER,
  DHAN_MARKET_DATA_PROVIDER,
  PRIMARY_MARKET_DATA_PROVIDER,
  MARKET_DATA_PROVIDER_TYPE,
  MARKET_DATA_RECONNECT_OPTIONS,
} from './market-data-provider.constants';
import { MarketDataProviderType } from './models/market-data-provider-type.enum';
import { DEFAULT_RECONNECT_OPTIONS } from './models/reconnect-options.model';
import { MockMarketDataProvider } from './providers/mock/mock-market-data.provider';
import { MOCK_MARKET_DATA_OPTIONS } from './providers/mock/mock-market-data-provider.constants';
import { DEFAULT_MOCK_PROVIDER_OPTIONS } from './providers/mock/mock-market-data-provider.options';
import { DhanMarketDataProvider } from './providers/dhan/dhan-market-data.provider';
import { MARKET_DATA_WEBSOCKET_CLIENT } from './providers/websocket-client.constants';
import { NativeWebSocketClient } from './providers/native-websocket-client';
import type { IMarketDataProvider } from './interfaces/market-data-provider.interface';

/**
 * The single owner of market data. Provider selection is fixed once, here,
 * at module-wiring time, from `ConfigService.marketDataProvider` — never
 * from TradingModeService or any other trading-mode-aware signal, so Paper
 * and Live always observe the exact same feed (Core Architecture Principle
 * #1/#2/#5). `BrokerAuthModule` is imported only for the token-repository
 * binding `MarketDataCredentialProvider` reads opportunistically — this
 * module never imports/injects `BrokerSessionManager` itself, so market data
 * has no dependency on the broker's login/session lifecycle (Principle #3):
 * it connects and streams whether or not a broker has ever been added.
 */
@Module({
  imports: [BrokerAuthModule],
  providers: [
    MarketDataCredentialProvider,
    SubscriptionManager,
    MarketDataService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: TIMER_SCHEDULER, useClass: NativeTimerScheduler },
    {
      provide: MOCK_MARKET_DATA_OPTIONS,
      useValue: DEFAULT_MOCK_PROVIDER_OPTIONS,
    },
    { provide: MARKET_DATA_WEBSOCKET_CLIENT, useClass: NativeWebSocketClient },
    {
      provide: MARKET_DATA_RECONNECT_OPTIONS,
      useValue: DEFAULT_RECONNECT_OPTIONS,
    },
    MockMarketDataProvider,
    DhanMarketDataProvider,
    { provide: MOCK_MARKET_DATA_PROVIDER, useExisting: MockMarketDataProvider },
    { provide: DHAN_MARKET_DATA_PROVIDER, useExisting: DhanMarketDataProvider },
    {
      provide: PRIMARY_MARKET_DATA_PROVIDER,
      // Injected via the MOCK_/DHAN_ tokens, not the concrete classes
      // directly — so a test's `.overrideProvider(MOCK_MARKET_DATA_PROVIDER)`
      // (or any future runtime rebinding) is actually observed here.
      inject: [
        ConfigService,
        MOCK_MARKET_DATA_PROVIDER,
        DHAN_MARKET_DATA_PROVIDER,
      ],
      useFactory: (
        configService: ConfigService,
        mock: IMarketDataProvider,
        dhan: IMarketDataProvider,
      ): IMarketDataProvider =>
        configService.marketDataProvider === 'DHAN' ? dhan : mock,
    },
    {
      provide: MARKET_DATA_PROVIDER_TYPE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): MarketDataProviderType =>
        configService.marketDataProvider === 'DHAN'
          ? MarketDataProviderType.DHAN
          : MarketDataProviderType.MOCK,
    },
  ],
  exports: [MarketDataService],
})
export class MarketDataModule {}
