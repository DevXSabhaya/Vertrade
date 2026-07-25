import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TradeValidationModule } from '@modules/trade-validation/trade-validation.module';
import { TradingEngineModule } from '@modules/trading-engine/trading-engine.module';
import { MarketDataModule } from '@modules/market-data/market-data.module';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { OrderQueueService } from './order-queue.service';
import { QueueWorker } from './queue-worker.service';
import { LockManager } from './lock/lock-manager';
import { QueueMetricsService } from './metrics/queue-metrics.service';
import {
  QueueItemDocumentSchema,
  QueueItemMongooseSchema,
} from './repository/queue-item.schema';
import { QueueItemRepository } from './repository/queue-item.repository';
import {
  DEFAULT_LOCK_TIMEOUT_MS,
  DEFAULT_MAX_QUEUE_SIZE,
  LOCK_TIMEOUT_MS,
  MAX_QUEUE_SIZE,
  QUEUE_REPOSITORY,
  RETRY_OPTIONS,
} from './order-queue.constants';
import { DEFAULT_RETRY_OPTIONS } from './models/retry-options.model';

/**
 * Wires the full Trade -> Validation -> Queue -> Lock -> Executor pipeline.
 * Nothing outside this module ever bypasses OrderQueueService to reach the
 * Trading Engine directly for trade creation.
 */
@Module({
  imports: [
    TradeValidationModule,
    TradingEngineModule,
    MarketDataModule,
    MongooseModule.forFeature([
      { name: QueueItemDocumentSchema.name, schema: QueueItemMongooseSchema },
    ]),
  ],
  providers: [
    OrderQueueService,
    QueueWorker,
    LockManager,
    QueueMetricsService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: QUEUE_REPOSITORY, useClass: QueueItemRepository },
    { provide: RETRY_OPTIONS, useValue: DEFAULT_RETRY_OPTIONS },
    { provide: LOCK_TIMEOUT_MS, useValue: DEFAULT_LOCK_TIMEOUT_MS },
    { provide: MAX_QUEUE_SIZE, useValue: DEFAULT_MAX_QUEUE_SIZE },
  ],
  exports: [OrderQueueService],
})
export class OrderQueueModule {}
