import type { BrokerSession } from '../entities/broker-session.entity';

/**
 * The rest of the application depends only on this interface — never on
 * AngelOneBrokerAuth directly — so a future Zerodha/Upstox/Fyers/Shoonya
 * broker-auth adapter can be added without touching any consumer.
 */
export interface IBrokerAuth {
  login(): Promise<BrokerSession>;
  refresh(session: BrokerSession): Promise<BrokerSession>;
  logout(session: BrokerSession): Promise<void>;
  /** Local, network-free expiry check — remote health checks are Broker Health Monitor's job (a later phase). */
  validateSession(session: BrokerSession): boolean;
}
