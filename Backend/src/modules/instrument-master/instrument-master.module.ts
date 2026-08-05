import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@core/config/config.module';
import { ConfigService } from '@core/config/config.service';
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
  PRIMARY_INSTRUMENT_MASTER_PROVIDER,
  INSTRUMENT_REPOSITORY,
} from './instrument-master.constants';
import type { IInstrumentMasterProvider } from './interfaces/instrument-master-provider.interface';

/**
 * Both MockInstrumentMasterProvider and DhanInstrumentMasterProvider are
 * always constructed (ordinary Nest singletons); which one
 * `InstrumentMasterService` actually depends on is decided once, here, at
 * module-wiring time, from `ConfigService.instrumentMasterProvider` — never
 * at runtime, and never driven by TradingModeService (Core Architecture
 * Principle #2: the instrument universe never switches based on Trading
 * Mode).
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
    {
      provide: PRIMARY_INSTRUMENT_MASTER_PROVIDER,
      // Injected via the MOCK_/DHAN_ tokens, not the concrete classes
      // directly — so a test's `.overrideProvider(MOCK_INSTRUMENT_MASTER_PROVIDER)`
      // (or any future runtime rebinding) is actually observed here.
      inject: [
        ConfigService,
        MOCK_INSTRUMENT_MASTER_PROVIDER,
        DHAN_INSTRUMENT_MASTER_PROVIDER,
      ],
      useFactory: (
        configService: ConfigService,
        mock: IInstrumentMasterProvider,
        dhan: IInstrumentMasterProvider,
      ): IInstrumentMasterProvider =>
        configService.instrumentMasterProvider === 'DHAN' ? dhan : mock,
    },
    { provide: INSTRUMENT_REPOSITORY, useClass: InstrumentMasterRepository },
    InstrumentCache,
    InstrumentMasterService,
  ],
  exports: [InstrumentMasterService, InstrumentCache],
})
export class InstrumentMasterModule {}
