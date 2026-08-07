import type {
  BrokerAccount,
  BrokerAccountCredentials,
} from '../models/broker-account.model';

export interface IBrokerAccountRepository {
  create(
    account: BrokerAccount,
    credentials: BrokerAccountCredentials,
  ): Promise<void>;
  findAllByUser(userId: string): Promise<BrokerAccount[]>;
  findById(userId: string, accountId: string): Promise<BrokerAccount | null>;
  getCredentials(
    userId: string,
    accountId: string,
  ): Promise<BrokerAccountCredentials>;
  /** Owner-agnostic lookup for consumers (order executors) that only ever receive an already-resolved `accountId` — never a raw, unverified `userId`+`accountId` pair from a client request. `accountId` alone is already globally unique. */
  getCredentialsByAccountId(
    accountId: string,
  ): Promise<BrokerAccountCredentials>;
  markActive(userId: string, accountId: string): Promise<BrokerAccount>;
  recordConnectionOutcome(
    userId: string,
    accountId: string,
    error: string | null,
  ): Promise<void>;
  delete(userId: string, accountId: string): Promise<void>;
}
