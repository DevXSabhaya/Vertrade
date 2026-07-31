import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@core/config/config.module';
import { HTTP_CLIENT } from '@shared/http/http-client.constants';
import { FetchHttpClient } from '@shared/http/fetch-http-client';
import { DhanInstrumentMasterProvider } from '@modules/broker/dhan/dhan-instrument-master.provider';
import {
  InstrumentDocumentSchema,
  InstrumentMongooseSchema,
} from './instrument-master.schema';
import { InstrumentMasterRepository } from './instrument-master.repository';
import { InstrumentCache } from './instrument-master.cache';
import { InstrumentMasterService } from './instrument-master.service';
import { MockInstrumentMasterProvider } from './providers/mock-instrument-master.provider';
import {
  MOCK_INSTRUMENT_MASTER_PROVIDER,
  DHAN_INSTRUMENT_MASTER_PROVIDER,
  INSTRUMENT_REPOSITORY,
} from './instrument-master.constants';

/**
 * Both MockInstrumentMasterProvider and DhanInstrumentMasterProvider are
 * always constructed (ordinary Nest singletons) — this module's providers
 * only ever *instantiate*, never decide which is active. Runtime selection
 * lives entirely inside InstrumentMasterService, driven by
 * TradingModeService.
 */
@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: InstrumentDocumentSchema.name, schema: InstrumentMongooseSchema },
    ]),
  ],
  providers: [
    { provide: HTTP_CLIENT, useClass: FetchHttpClient },
    MockInstrumentMasterProvider,
    DhanInstrumentMasterProvider,
    {
      provide: MOCK_INSTRUMENT_MASTER_PROVIDER,
      useExisting: MockInstrumentMasterProvider,
    },
    {
      provide: DHAN_INSTRUMENT_MASTER_PROVIDER,
      useExisting: DhanInstrumentMasterProvider,
    },
    { provide: INSTRUMENT_REPOSITORY, useClass: InstrumentMasterRepository },
    InstrumentCache,
    InstrumentMasterService,
  ],
  exports: [InstrumentMasterService, InstrumentCache],
})
export class InstrumentMasterModule {}
