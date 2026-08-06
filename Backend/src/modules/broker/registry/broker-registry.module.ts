import { Module } from '@nestjs/common';
import { BrokerAuthModule } from '../broker-auth/broker-auth.module';
import { ExecutorsModule } from '../executors/executors.module';
import { BrokerRegistry } from './broker-registry.service';
import { BrokerFactory } from './broker-factory.service';
import { BROKER_DEFINITIONS_PROVIDER } from './broker-definitions.provider';

/**
 * Additive, self-contained: does not modify `ExecutorsModule`'s existing
 * `ORDER_EXECUTOR`/`RoutingOrderExecutor` wiring that the Trading Engine
 * depends on — it only reads the already-exported `DhanExecutor` and the
 * `BROKER_AUTH` token from `BrokerAuthModule`/`ExecutorsModule` to build the
 * Dhan registry entry, alongside seven placeholder entries for brokers with
 * no live adapter yet.
 */
@Module({
  imports: [BrokerAuthModule, ExecutorsModule],
  providers: [BROKER_DEFINITIONS_PROVIDER, BrokerRegistry, BrokerFactory],
  exports: [BrokerRegistry, BrokerFactory],
})
export class BrokerRegistryModule {}
