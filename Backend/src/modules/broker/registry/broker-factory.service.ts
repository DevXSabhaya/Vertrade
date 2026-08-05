import { Injectable } from '@nestjs/common';
import type { IBrokerAuth } from '../broker-auth/interfaces/broker-auth.interface';
import type { IOrderExecutor } from '../executors/order-executor.interface';
import type { BrokerId } from './models/broker-id.enum';
import type { BrokerMetadata } from './models/broker-metadata.model';
import { BrokerRegistry } from './broker-registry.service';

/**
 * Thin facade over `BrokerRegistry` for consumers that only ever need one
 * broker's adapter/metadata by id (BrokerAccountService in Phase 3, mainly)
 * — keeps `BrokerRegistry` itself focused on being the lookup table, not the
 * call-site-facing API.
 */
@Injectable()
export class BrokerFactory {
  constructor(private readonly registry: BrokerRegistry) {}

  getAuth(id: BrokerId): IBrokerAuth {
    return this.registry.get(id).auth;
  }

  getExecutor(id: BrokerId): IOrderExecutor {
    return this.registry.get(id).executor;
  }

  getMetadata(id: BrokerId): BrokerMetadata {
    return this.registry.get(id).metadata;
  }

  listMetadata(): readonly BrokerMetadata[] {
    return this.registry.getAll().map((definition) => definition.metadata);
  }
}
