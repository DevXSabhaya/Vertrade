import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  BrokerAccountDocumentSchema,
  BrokerAccountMongooseSchema,
} from './broker-account.schema';
import { BrokerAccountRepository } from './repository/broker-account.repository';
import { BROKER_ACCOUNT_REPOSITORY } from './broker-account.constants';

/**
 * Just the `BrokerAccount` Mongoose binding + `IBrokerAccountRepository`
 * provider, deliberately split out of `BrokerAccountModule` (which also
 * imports `BrokerRegistryModule`, in turn importing `ExecutorsModule`).
 * `DhanExecutor` (in `ExecutorsModule`) needs the repository directly, to
 * read a specific account's own credentials for order placement — importing
 * `BrokerAccountModule` there would create a module cycle
 * (`ExecutorsModule` -> `BrokerAccountModule` -> `BrokerRegistryModule` ->
 * `ExecutorsModule`). This leaf module has no other imports, so both
 * `BrokerAccountModule` and `ExecutorsModule` can depend on it directly
 * with no cycle.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: BrokerAccountDocumentSchema.name,
        schema: BrokerAccountMongooseSchema,
      },
    ]),
  ],
  providers: [
    { provide: BROKER_ACCOUNT_REPOSITORY, useClass: BrokerAccountRepository },
  ],
  exports: [BROKER_ACCOUNT_REPOSITORY],
})
export class BrokerAccountPersistenceModule {}
