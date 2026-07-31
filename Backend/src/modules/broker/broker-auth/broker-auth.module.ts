import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  BrokerTokenDocumentSchema,
  BrokerTokenMongooseSchema,
} from './broker-token.schema';
import { BrokerCredentialsProvider } from './broker-credentials.provider';
import { BrokerTokenRepository } from './broker-token.repository';
import { FetchBrokerHttpClient } from './fetch-broker-http-client';
import { DhanBrokerAuth } from './dhan-broker-auth';
import { DhanAccountService } from './dhan-account.service';
import { BrokerSessionManager } from './broker-session-manager';
import { BrokerTokenRenewalScheduler } from './broker-token-renewal.scheduler';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import { NativeTimerScheduler } from '@shared/scheduler/native-timer-scheduler';
import {
  BROKER_AUTH,
  BROKER_HTTP_CLIENT,
  BROKER_TOKEN_REPOSITORY,
} from './broker-auth.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: BrokerTokenDocumentSchema.name,
        schema: BrokerTokenMongooseSchema,
      },
    ]),
  ],
  providers: [
    BrokerCredentialsProvider,
    { provide: BROKER_TOKEN_REPOSITORY, useClass: BrokerTokenRepository },
    { provide: BROKER_HTTP_CLIENT, useClass: FetchBrokerHttpClient },
    { provide: BROKER_AUTH, useClass: DhanBrokerAuth },
    { provide: TIMER_SCHEDULER, useClass: NativeTimerScheduler },
    DhanAccountService,
    BrokerSessionManager,
    BrokerTokenRenewalScheduler,
  ],
  exports: [
    BrokerSessionManager,
    DhanAccountService,
    BrokerTokenRenewalScheduler,
  ],
})
export class BrokerAuthModule {}
