import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  BrokerTokenDocumentSchema,
  BrokerTokenMongooseSchema,
} from './broker-token.schema';
import { BrokerCredentialsProvider } from './broker-credentials.provider';
import { BrokerTokenRepository } from './broker-token.repository';
import { FetchBrokerHttpClient } from './fetch-broker-http-client';
import { AngelOneBrokerAuth } from './angel-one-broker-auth';
import { BrokerSessionManager } from './broker-session-manager';
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
    { provide: BROKER_AUTH, useClass: AngelOneBrokerAuth },
    BrokerSessionManager,
  ],
  exports: [BrokerSessionManager],
})
export class BrokerAuthModule {}
