import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { PaperAccountService } from './paper-account.service';
import { PaperAccountEventListener } from './paper-account-event-listener.service';
import { PAPER_ACCOUNT_REPOSITORY } from './paper-account.constants';
import { PaperAccountRepository } from './repository/paper-account.repository';
import {
  PaperAccountDocumentSchema,
  PaperAccountMongooseSchema,
} from './schema/paper-account.schema';

/**
 * Phase 12, Part 3 — the paper trading account/virtual balance domain. No
 * dependency on `TradingEngineModule`/`OrderQueueModule`/`TradeLifecycleModule`
 * at all: this module only ever moves money between `availableBalance` and
 * `reservedMargin`, driven by explicit calls from `PaperTradingModule` (which
 * imports this module) plus the `UserRegisteredEvent` subscription above.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: PaperAccountDocumentSchema.name,
        schema: PaperAccountMongooseSchema,
      },
    ]),
  ],
  providers: [
    PaperAccountService,
    PaperAccountEventListener,
    { provide: CLOCK, useClass: SystemClock },
    { provide: PAPER_ACCOUNT_REPOSITORY, useClass: PaperAccountRepository },
  ],
  exports: [PaperAccountService],
})
export class PaperAccountModule {}
