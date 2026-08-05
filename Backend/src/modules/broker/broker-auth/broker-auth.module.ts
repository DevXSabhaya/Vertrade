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
  ACTIVE_BROKER_NAME,
  BROKER_AUTH,
  BROKER_HTTP_CLIENT,
  BROKER_NAME_DHAN,
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
    // Dhan is the only broker with a real adapter today — see
    // ACTIVE_BROKER_NAME's docstring in broker-auth.constants.ts for how
    // this becomes operator/Broker-Manager-driven once a second real broker
    // exists.
    { provide: ACTIVE_BROKER_NAME, useValue: BROKER_NAME_DHAN },
    { provide: TIMER_SCHEDULER, useClass: NativeTimerScheduler },
    DhanAccountService,
    BrokerSessionManager,
    BrokerTokenRenewalScheduler,
  ],
  exports: [
    BrokerSessionManager,
    DhanAccountService,
    BrokerTokenRenewalScheduler,
    // MarketDataCredentialProvider (in MarketDataModule) reads the latest
    // persisted broker token directly, deliberately without depending on
    // BrokerSessionManager's session lifecycle — see its own docstring.
    BROKER_TOKEN_REPOSITORY,
    // BrokerRegistryModule builds the Dhan BrokerDefinition entry from the
    // same IBrokerAuth implementation BrokerSessionManager uses — one real
    // adapter, two independent consumers.
    BROKER_AUTH,
  ],
})
export class BrokerAuthModule {}
