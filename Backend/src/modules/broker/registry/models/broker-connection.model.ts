import type { BrokerId } from './broker-id.enum';
import type { BrokerStatus } from './broker-status.enum';

/** Runtime connection snapshot for one broker — what `GET /brokers` reports per broker card. */
export interface BrokerConnection {
  readonly brokerId: BrokerId;
  readonly status: BrokerStatus;
  readonly lastConnectedAt: Date | null;
  readonly lastError: string | null;
}
