import { Module } from '@nestjs/common';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { BrokerCredentialsProvider } from '@modules/broker/broker-auth/broker-credentials.provider';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import { NativeTimerScheduler } from '@shared/scheduler/native-timer-scheduler';
import { MarketDataService } from './market-data.service';
import { SubscriptionManager } from './subscription/subscription-manager';
import {
  MOCK_MARKET_DATA_PROVIDER,
  DHAN_MARKET_DATA_PROVIDER,
  MARKET_DATA_RECONNECT_OPTIONS,
} from './market-data-provider.constants';
import { DEFAULT_RECONNECT_OPTIONS } from './models/reconnect-options.model';
import { MockMarketDataProvider } from './providers/mock/mock-market-data.provider';
import { MOCK_MARKET_DATA_OPTIONS } from './providers/mock/mock-market-data-provider.constants';
import { DEFAULT_MOCK_PROVIDER_OPTIONS } from './providers/mock/mock-market-data-provider.options';
import { DhanMarketDataProvider } from './providers/dhan/dhan-market-data.provider';
import { MARKET_DATA_WEBSOCKET_CLIENT } from './providers/websocket-client.constants';
import { NativeWebSocketClient } from './providers/native-websocket-client';

/**
 * The single owner of market data. Both MockMarketDataProvider and
 * DhanMarketDataProvider are always constructed (ordinary Nest singletons,
 * injected via the MOCK_MARKET_DATA_PROVIDER/DHAN_MARKET_DATA_PROVIDER
 * tokens) — this module's factories only ever *instantiate*, they never
 * decide which one is active. Runtime selection between them lives entirely
 * inside MarketDataService, driven by TradingModeService. The Trading Engine
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
    { provide: MOCK_MARKET_DATA_PROVIDER, useExisting: MockMarketDataProvider },
    { provide: DHAN_MARKET_DATA_PROVIDER, useExisting: DhanMarketDataProvider },
  ],
  exports: [MarketDataService],
})
export class MarketDataModule {}
