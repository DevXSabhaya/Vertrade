import { Module } from '@nestjs/common';
import { ConfigModule } from '@core/config/config.module';
import { ConfigService } from '@core/config/config.service';
import { FeatureFlagsModule } from '@core/feature-flags/feature-flags.module';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { BrokerCredentialsProvider } from '@modules/broker/broker-auth/broker-credentials.provider';
import { FetchBrokerHttpClient } from '@modules/broker/broker-auth/fetch-broker-http-client';
import type { IOrderExecutor } from './order-executor.interface';
import { PaperExecutor } from './paper.executor';
import { AngelOneExecutor } from './angel-one/angel-one.executor';
import { LiveOrderSafetyGateService } from './live-order-safety-gate.service';
import { ORDER_HTTP_CLIENT } from './angel-one/angel-one-executor.constants';
import { ORDER_EXECUTOR } from './order-executor.constants';

/** The one place Paper vs Live executor selection happens — extracted as a pure function so it's directly unit-testable without booting the full Nest DI graph. */
export function selectOrderExecutor(
  configService: Pick<ConfigService, 'tradingMode'>,
  paperExecutor: IOrderExecutor,
  angelOneExecutor: IOrderExecutor,
): IOrderExecutor {
  return configService.tradingMode === 'LIVE'
    ? angelOneExecutor
    : paperExecutor;
}

/**
 * The Trading Engine (Phase 5) depends only on the IOrderExecutor interface,
 * never on a concrete executor class — this is the one place that decision is
 * made, so no trading-mode if/else is ever duplicated inside the Engine
 * itself. ORDER_EXECUTOR resolves purely from `ConfigService.tradingMode`
 * (validated at boot in `env.validation.ts`, defaulting to PAPER, and which
 * refuses to boot at all in LIVE mode without real Angel One credentials —
 * see `LIVE_MODE_REQUIRED_STRING_KEYS`). There is no runtime fallback path:
 * if TRADING_MODE=LIVE the process either has real credentials and uses
 * AngelOneExecutor, or it never started. Both concrete classes remain
 * exported so callers (e.g. audit logging of which executor produced an
 * order) can still inject either directly.
 */
@Module({
  imports: [BrokerAuthModule, ConfigModule, FeatureFlagsModule],
  providers: [
    PaperExecutor,
    BrokerCredentialsProvider,
    { provide: ORDER_HTTP_CLIENT, useClass: FetchBrokerHttpClient },
    LiveOrderSafetyGateService,
    AngelOneExecutor,
    {
      provide: ORDER_EXECUTOR,
      useFactory: (
        configService: ConfigService,
        paperExecutor: PaperExecutor,
        angelOneExecutor: AngelOneExecutor,
      ): IOrderExecutor =>
        selectOrderExecutor(configService, paperExecutor, angelOneExecutor),
      inject: [ConfigService, PaperExecutor, AngelOneExecutor],
    },
  ],
  exports: [
    PaperExecutor,
    AngelOneExecutor,
    ORDER_EXECUTOR,
    LiveOrderSafetyGateService,
  ],
})
export class ExecutorsModule {}
