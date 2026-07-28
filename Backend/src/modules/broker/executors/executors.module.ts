import { Module } from '@nestjs/common';
import { ConfigModule } from '@core/config/config.module';
import { FeatureFlagsModule } from '@core/feature-flags/feature-flags.module';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { BrokerCredentialsProvider } from '@modules/broker/broker-auth/broker-credentials.provider';
import { FetchBrokerHttpClient } from '@modules/broker/broker-auth/fetch-broker-http-client';
import { TradingModeModule } from '@modules/trading-mode/trading-mode.module';
import { PaperExecutor } from './paper.executor';
import { AngelOneExecutor } from './angel-one/angel-one.executor';
import { LiveOrderSafetyGateService } from './live-order-safety-gate.service';
import { RoutingOrderExecutor } from './routing-order-executor';
import { ORDER_HTTP_CLIENT } from './angel-one/angel-one-executor.constants';
import { ORDER_EXECUTOR } from './order-executor.constants';

/**
 * The Trading Engine depends only on the IOrderExecutor interface, never on
 * a concrete executor class. `ORDER_EXECUTOR` resolves to `RoutingOrderExecutor`,
 * which picks Paper vs Live per call from `TradingModeService`'s current
 * (persisted, runtime-switchable) mode — for consumers that should always
 * see "whatever the deployment's mode is right now" (e.g. Position
 * Reconciliation). `TradingEngineService` itself does NOT use this token —
 * it pins each trade's executor once at creation time instead, so an
 * in-flight trade can never have its entry and exit legs split across Paper
 * and a real broker just because an operator switched modes mid-trade (see
 * `TradingEngineService.executorFor`). Both concrete classes remain exported
 * so callers (e.g. audit logging of which executor produced an order) can
 * still inject either directly.
 */
@Module({
  imports: [
    BrokerAuthModule,
    ConfigModule,
    FeatureFlagsModule,
    TradingModeModule,
  ],
  providers: [
    PaperExecutor,
    BrokerCredentialsProvider,
    { provide: ORDER_HTTP_CLIENT, useClass: FetchBrokerHttpClient },
    LiveOrderSafetyGateService,
    AngelOneExecutor,
    RoutingOrderExecutor,
    { provide: ORDER_EXECUTOR, useExisting: RoutingOrderExecutor },
  ],
  exports: [
    PaperExecutor,
    AngelOneExecutor,
    ORDER_EXECUTOR,
    LiveOrderSafetyGateService,
  ],
})
export class ExecutorsModule {}
