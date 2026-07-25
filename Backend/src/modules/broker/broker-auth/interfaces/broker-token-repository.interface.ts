import type { BrokerSession } from '../entities/broker-session.entity';

export interface IBrokerTokenRepository {
  save(userId: string, broker: string, session: BrokerSession): Promise<void>;
  find(userId: string, broker: string): Promise<BrokerSession | null>;
  clear(userId: string, broker: string): Promise<void>;
}
