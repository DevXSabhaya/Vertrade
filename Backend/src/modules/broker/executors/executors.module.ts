import { Module } from '@nestjs/common';
import { ConfigModule } from '@core/config/config.module';
import { FeatureFlagsModule } from '@core/feature-flags/feature-flags.module';
import { BrokerAuthModule } from '@modules/broker/broker-auth/broker-auth.module';
import { FetchBrokerHttpClient } from '@modules/broker/broker-auth/fetch-broker-http-client';
import { BrokerAccountPersistenceModule } from '@modules/broker/broker-account/broker-account-persistence.module';
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
 * which picks Paper vs Live per call purely from whether an `accountId` is
 * present — never from a "deployment's current mode" (trading mode is
 * per-user now; there is no such global signal). `TradingEngineService`
 * itself does NOT use this token — it pins each trade's executor once at
 * creation time instead (see `TradingEngineService.executorFor`). Both
 * concrete classes remain exported so callers (e.g. audit logging of which
 * executor produced an order) can still inject either directly.
 *
 * Imports `BrokerAccountPersistenceModule` (not the full
 * `BrokerAccountModule`) deliberately: `DhanExecutor` needs only the
 * `IBrokerAccountRepository` to read a resolved account's own credentials —
 * importing the full `BrokerAccountModule` here would create a module cycle
 * (`BrokerAccountModule` -> `BrokerRegistryModule` -> `ExecutorsModule`).
 */
@Module({
  imports: [
    BrokerAuthModule,
    BrokerAccountPersistenceModule,
    ConfigModule,
    FeatureFlagsModule,
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
