import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TradingEngineModule } from '@modules/trading-engine/trading-engine.module';
import { MarketDataModule } from '@modules/market-data/market-data.module';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { TradeExtensionStore } from './trade-extension.store';
import { PnLService } from './pnl.service';
import { PositionManager } from './position-manager.service';
import { StopLossManager } from './stop-loss-manager.service';
import { ExitManager } from './exit-manager.service';
import { TargetManager } from './target-manager.service';
import { TrailingManager } from './trailing-manager.service';
import { TradeLifecycleService } from './trade-lifecycle.service';
import { TradeManager } from './trade-manager.service';
import { TradesController } from './trades.controller';
import { PositionsController } from './positions.controller';
import {
  TRADE_EXTENSION_REPOSITORY,
  TRADE_HISTORY_REPOSITORY,
} from './trade-lifecycle.constants';
import {
  TradeExtensionDocumentSchema,
  TradeExtensionMongooseSchema,
} from './repository/trade-extension.schema';
import { TradeExtensionRepository } from './repository/trade-extension.repository';
import {
  TradeHistoryDocumentSchema,
  TradeHistoryMongooseSchema,
} from './repository/trade-history.schema';
import { TradeHistoryRepository } from './repository/trade-history.repository';

/**
 * Phase 10 — the Trade Lifecycle Engine. Depends on `TradingEngineModule`
 * (Phase 5, unchanged) as its single source of truth for trade state; never
 * duplicates the Trade aggregate or its state machine, only reads from it
 * and — for the handful of new orchestration entry points
 * (`updateTrailingStopLoss`/`requestPartialExit`/`requestFullExit`) —
 * calls into it exactly like the tick-evaluation loop already does.
 */
@Module({
  imports: [
    TradingEngineModule,
    MarketDataModule,
    MongooseModule.forFeature([
      {
        name: TradeExtensionDocumentSchema.name,
        schema: TradeExtensionMongooseSchema,
      },
      {
        name: TradeHistoryDocumentSchema.name,
        schema: TradeHistoryMongooseSchema,
      },
    ]),
  ],
  controllers: [TradesController, PositionsController],
  providers: [
    TradeExtensionStore,
    PnLService,
    PositionManager,
    StopLossManager,
    ExitManager,
    TargetManager,
    TrailingManager,
    TradeLifecycleService,
    TradeManager,
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: TRADE_EXTENSION_REPOSITORY,
      useClass: TradeExtensionRepository,
    },
    { provide: TRADE_HISTORY_REPOSITORY, useClass: TradeHistoryRepository },
  ],
  exports: [
    PnLService,
    PositionManager,
    StopLossManager,
    ExitManager,
    TargetManager,
    TrailingManager,
    TradeManager,
    TradeExtensionStore,
  ],
})
export class TradeLifecycleModule {}
