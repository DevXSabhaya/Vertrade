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
  deactivateAllForUser(userId: string): Promise<void>;
  markActive(userId: string, accountId: string): Promise<BrokerAccount>;
  recordConnectionOutcome(
    userId: string,
    accountId: string,
    error: string | null,
  ): Promise<void>;
  delete(userId: string, accountId: string): Promise<void>;
}
