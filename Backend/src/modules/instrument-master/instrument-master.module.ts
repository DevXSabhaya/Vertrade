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
import type { IInstrumentMasterProvider } from './interfaces/instrument-master-provider.interface';
import {
  INSTRUMENT_MASTER_PROVIDER,
  INSTRUMENT_REPOSITORY,
} from './instrument-master.constants';

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
      provide: INSTRUMENT_MASTER_PROVIDER,
      useFactory: (
        configService: ConfigService,
        mock: MockInstrumentMasterProvider,
        dhan: DhanInstrumentMasterProvider,
      ): IInstrumentMasterProvider =>
        configService.instrumentMasterProvider === 'DHAN' ? dhan : mock,
      inject: [
        ConfigService,
        MockInstrumentMasterProvider,
        DhanInstrumentMasterProvider,
      ],
    },
    { provide: INSTRUMENT_REPOSITORY, useClass: InstrumentMasterRepository },
    InstrumentCache,
    InstrumentMasterService,
  ],
  exports: [InstrumentMasterService, InstrumentCache],
})
export class InstrumentMasterModule {}
