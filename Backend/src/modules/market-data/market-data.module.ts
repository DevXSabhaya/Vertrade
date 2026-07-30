import { Module } from '@nestjs/common';
import { ConfigService } from '@core/config/config.service';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { BrokerCredentialsProvider } from '@modules/broker/broker-auth/broker-credentials.provider';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import { NativeTimerScheduler } from '@shared/scheduler/native-timer-scheduler';
import { MarketDataService } from './market-data.service';
import { SubscriptionManager } from './subscription/subscription-manager';
import {
  MARKET_DATA_PROVIDER,
  MARKET_DATA_RECONNECT_OPTIONS,
} from './market-data-provider.constants';
import { DEFAULT_RECONNECT_OPTIONS } from './models/reconnect-options.model';
import { MockMarketDataProvider } from './providers/mock/mock-market-data.provider';
import { MOCK_MARKET_DATA_OPTIONS } from './providers/mock/mock-market-data-provider.constants';
import { DEFAULT_MOCK_PROVIDER_OPTIONS } from './providers/mock/mock-market-data-provider.options';
import { DhanMarketDataProvider } from './providers/dhan/dhan-market-data.provider';
import { MARKET_DATA_WEBSOCKET_CLIENT } from './providers/websocket-client.constants';
import { NativeWebSocketClient } from './providers/native-websocket-client';
import type { IMarketDataProvider } from './interfaces/market-data-provider.interface';

/**
 * The single owner of market data. ORDER_EXECUTOR-style DI token selection:
 * MARKET_DATA_PROVIDER resolves to MockMarketDataProvider by default —
 * switching to DhanMarketDataProvider is a MARKET_DATA_PROVIDER=DHAN
 * environment variable change only, never a code change. The Trading Engine
 * does not import this module: it only ever subscribes to
 * MarketPriceUpdatedEvent, published here.
 */
@Module({
  imports: [BrokerAuthModule],
  providers: [
    BrokerCredentialsProvider,
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
    {
      provide: MARKET_DATA_PROVIDER,
      useFactory: (
        configService: ConfigService,
        mock: MockMarketDataProvider,
        dhan: DhanMarketDataProvider,
      ): IMarketDataProvider =>
        configService.marketDataProvider === 'DHAN' ? dhan : mock,
      inject: [ConfigService, MockMarketDataProvider, DhanMarketDataProvider],
    },
  ],
  exports: [MarketDataService],
})
export class MarketDataModule {}
