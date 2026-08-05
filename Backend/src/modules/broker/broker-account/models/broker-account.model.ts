import type { BrokerId } from '../../registry/models/broker-id.enum';

/** Persisted, non-secret shape of a saved broker account — what BrokerAccountService/Controller work with. Credentials are never included: they live only in the repository's encrypted column and are read back out only at the moment of activation. */
export interface BrokerAccount {
  readonly accountId: string;
  readonly userId: string;
  readonly brokerId: BrokerId;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastConnectedAt: Date | null;
  readonly lastError: string | null;
}

/** Broker-specific secret material for a saved account. Shape is intentionally generic (matches what Dhan needs today); a future real adapter for another broker can widen this without touching callers that only pass it through opaquely. */
export interface BrokerAccountCredentials {
  readonly clientId: string;
  readonly accessToken: string;
}
