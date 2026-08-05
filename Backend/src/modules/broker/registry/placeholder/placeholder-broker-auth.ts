import type { IBrokerAuth } from '../../broker-auth/interfaces/broker-auth.interface';
import type { BrokerSession } from '../../broker-auth/entities/broker-session.entity';
import { BrokerNotImplementedException } from '../exceptions/broker-not-implemented.exception';

/**
 * Shared `IBrokerAuth` implementation for every broker that has a registry
 * entry but no real adapter yet. One class, parametrized by display name,
 * rather than seven near-identical stub classes — the behavior for "not
 * implemented" is the same regardless of which broker it is, so a single
 * generic implementation is the correct amount of abstraction here.
 */
export class PlaceholderBrokerAuth implements IBrokerAuth {
  constructor(private readonly brokerDisplayName: string) {}

  login(): Promise<BrokerSession> {
    return Promise.reject(
      new BrokerNotImplementedException(this.brokerDisplayName),
    );
  }

  refresh(): Promise<BrokerSession> {
    return Promise.reject(
      new BrokerNotImplementedException(this.brokerDisplayName),
    );
  }

  logout(): Promise<void> {
    return Promise.reject(
      new BrokerNotImplementedException(this.brokerDisplayName),
    );
  }

  validateSession(): boolean {
    return false;
  }
}
