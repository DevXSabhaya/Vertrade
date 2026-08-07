import { Module } from '@nestjs/common';
import { ConfigModule } from '@core/config/config.module';
import { FeatureFlagsModule } from '@core/feature-flags/feature-flags.module';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { BrokerCredentialsProvider } from '@modules/broker/broker-auth/broker-credentials.provider';
import { FetchBrokerHttpClient } from '@modules/broker/broker-auth/fetch-broker-http-client';
import { TradingModeModule } from '@modules/trading-mode/trading-mode.module';
import { PaperExecutor } from './paper.executor';
import { DhanExecutor } from './dhan/dhan.executor';
import { LiveOrderSafetyGateService } from './live-order-safety-gate.service';
import { RoutingOrderExecutor } from './routing-order-executor';
import { ORDER_HTTP_CLIENT } from './dhan/dhan-executor.constants';
import {
  ORDER_EXECUTOR,
  PAPER_EXECUTION_CONFIG,
} from './order-executor.constants';
import { DEFAULT_PAPER_EXECUTION_CONFIG } from './models/paper-execution-config.model';

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
    // Zero-effect by default (no slippage, always full-fill, never
    // rejected) — every existing deterministic behavior of PaperExecutor is
    // unchanged unless this binding is overridden with a non-default
    // PaperExecutionConfig.
    {
      provide: PAPER_EXECUTION_CONFIG,
      useValue: DEFAULT_PAPER_EXECUTION_CONFIG,
    },
    BrokerCredentialsProvider,
    { provide: ORDER_HTTP_CLIENT, useClass: FetchBrokerHttpClient },
    LiveOrderSafetyGateService,
    DhanExecutor,
    RoutingOrderExecutor,
    { provide: ORDER_EXECUTOR, useExisting: RoutingOrderExecutor },
  ],
  exports: [
    PaperExecutor,
    DhanExecutor,
    ORDER_EXECUTOR,
    LiveOrderSafetyGateService,
  ],
})
export class ExecutorsModule {}
