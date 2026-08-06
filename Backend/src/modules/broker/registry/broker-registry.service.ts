import { Inject, Injectable } from '@nestjs/common';
import type { BrokerId } from './models/broker-id.enum';
import type { BrokerDefinition } from './interfaces/broker-definition.interface';
import { BROKER_DEFINITIONS } from './broker-registry.constants';
import { UnknownBrokerException } from './exceptions/unknown-broker.exception';

/**
 * The single lookup point for "what brokers does this platform know about,
 * and what's each one's auth/executor adapter." BrokerManagerService (Phase
 * 3) and anything else that needs to browse/connect a broker depends only on
 * this class — adding a real adapter for a currently-placeholder broker
 * later means changing that one broker's `BrokerDefinition` provider, never
 * this class or its consumers (Open/Closed Principle, same pattern as
 * `RuleRegistry`/`HEALTH_INDICATORS`/`SCHEDULED_JOBS`).
 */
@Injectable()
export class BrokerRegistry {
  private readonly byId = new Map<BrokerId, BrokerDefinition>();

  constructor(
    @Inject(BROKER_DEFINITIONS) definitions: readonly BrokerDefinition[],
  ) {
    for (const definition of definitions) {
      this.byId.set(definition.metadata.id, definition);
    }
  }

  getAll(): readonly BrokerDefinition[] {
    return Array.from(this.byId.values());
  }

  get(id: BrokerId): BrokerDefinition {
    const definition = this.byId.get(id);
    if (!definition) {
      throw new UnknownBrokerException(id);
    }
    return definition;
  }

  isSupported(id: BrokerId): boolean {
    return this.byId.has(id);
  }

  isImplemented(id: BrokerId): boolean {
    return this.byId.get(id)?.metadata.isImplemented ?? false;
  }
}
