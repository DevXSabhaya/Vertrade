import type { BrokerSession } from '../entities/broker-session.entity';

/**
 * Keyed by `accountId` (a `BrokerAccount.accountId`, already globally
 * unique and already implying both the owning user and the broker) — one
 * stored token per broker account, never a single shared row.
 */
export interface IBrokerTokenRepository {
  save(
    accountId: string,
    broker: string,
    session: BrokerSession,
  ): Promise<void>;
  find(accountId: string, broker: string): Promise<BrokerSession | null>;
  clear(accountId: string, broker: string): Promise<void>;
}
