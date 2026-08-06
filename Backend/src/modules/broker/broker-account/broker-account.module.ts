import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '@modules/auth/auth.module';
import { BrokerAuthModule } from '../broker-auth/broker-auth.module';
import { BrokerRegistryModule } from '../registry/broker-registry.module';
import {
  BrokerAccountDocumentSchema,
  BrokerAccountMongooseSchema,
} from './broker-account.schema';
import { BrokerAccountRepository } from './repository/broker-account.repository';
import { BROKER_ACCOUNT_REPOSITORY } from './broker-account.constants';
import { BrokerAccountService } from './broker-account.service';
import { BrokerAccountController } from './broker-account.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: BrokerAccountDocumentSchema.name,
        schema: BrokerAccountMongooseSchema,
      },
    ]),
    AuthModule,
    BrokerAuthModule,
    BrokerRegistryModule,
  ],
  controllers: [BrokerAccountController],
  providers: [
    { provide: BROKER_ACCOUNT_REPOSITORY, useClass: BrokerAccountRepository },
    BrokerAccountService,
  ],
  exports: [BrokerAccountService],
})
export class BrokerAccountModule {}
