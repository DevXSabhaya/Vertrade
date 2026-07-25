import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { AuthModule } from '@modules/auth/auth.module';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PaperAccountModule } from '@modules/paper-account/paper-account.module';
import { OrderQueueModule } from '@modules/order-queue/order-queue.module';
import { TradeLifecycleModule } from '@modules/trade-lifecycle/trade-lifecycle.module';
import { PaperTradingService } from './paper-trading.service';
import { PaperTradeOwnershipService } from './paper-trade-ownership.service';
import { PaperTradeEventListener } from './paper-trade-event-listener.service';
import { PAPER_TRADE_OWNERSHIP_REPOSITORY } from './paper-trading.constants';
import { PaperTradeOwnershipRepository } from './repository/paper-trade-ownership.repository';
import {
  PaperTradeOwnershipDocumentSchema,
  PaperTradeOwnershipMongooseSchema,
} from './schema/paper-trade-ownership.schema';
import { AccountController } from './controllers/account.controller';
import { PaperTradesController } from './controllers/paper-trades.controller';
import { PaperPositionsController } from './controllers/paper-positions.controller';
import { PaperOrdersController } from './controllers/paper-orders.controller';
import { PaperPnlController } from './controllers/paper-pnl.controller';

/**
 * Phase 12's product API surface — the only new module that touches the
 * trading pipeline, and only ever *through* `OrderQueueModule`'s
 * `submitTrade()`/`cancel()` and `TradeLifecycleModule`'s `TradeManager`.
 * Never imports `TradingEngineModule`, `TradeValidationModule`, or
 * `RiskManagementModule` directly — every trade this module submits still
 * runs the full existing Validation -> Risk -> Engine -> Queue -> Executor
 * pipeline unchanged. All controllers here require `JwtAuthGuard` and derive
 * `userId` only from the verified token (`AuthModule`, imported below).
 */
@Module({
  imports: [
    AuthModule,
    PaperAccountModule,
    OrderQueueModule,
    TradeLifecycleModule,
    MongooseModule.forFeature([
      {
        name: PaperTradeOwnershipDocumentSchema.name,
        schema: PaperTradeOwnershipMongooseSchema,
      },
    ]),
  ],
  controllers: [
    AccountController,
    PaperTradesController,
    PaperPositionsController,
    PaperOrdersController,
    PaperPnlController,
  ],
  providers: [
    PaperTradingService,
    PaperTradeOwnershipService,
    PaperTradeEventListener,
    JwtAuthGuard,
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: PAPER_TRADE_OWNERSHIP_REPOSITORY,
      useClass: PaperTradeOwnershipRepository,
    },
  ],
  exports: [PaperTradingService, PaperTradeOwnershipService],
})
export class PaperTradingModule {}
