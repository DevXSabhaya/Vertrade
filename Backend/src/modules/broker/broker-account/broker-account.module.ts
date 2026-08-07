import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { BrokerAuthModule } from '../broker-auth/broker-auth.module';
import { BrokerRegistryModule } from '../registry/broker-registry.module';
import { BrokerAccountPersistenceModule } from './broker-account-persistence.module';
import { BrokerAccountService } from './broker-account.service';
import { BrokerAccountController } from './broker-account.controller';

@Module({
  imports: [
    BrokerAccountPersistenceModule,
    AuthModule,
    BrokerAuthModule,
    BrokerRegistryModule,
  ],
  controllers: [BrokerAccountController],
  providers: [BrokerAccountService],
  exports: [BrokerAccountService],
})
export class BrokerAccountModule {}
