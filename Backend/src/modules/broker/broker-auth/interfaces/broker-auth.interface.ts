import type { BrokerSession } from '../entities/broker-session.entity';

/**
 * The rest of the application depends only on this interface — never on
 * DhanBrokerAuth directly — so a future Zerodha/Upstox/Fyers/Shoonya
 * broker-auth adapter can be added without touching any consumer.
 */
export interface IBrokerAuth {
  /**
   * @param overrideAccessToken When provided (the manual reconnect flow —
   * an operator pasting a freshly console-generated token), this token is
   * used instead of the configured `DHAN_ACCESS_TOKEN` env value. Additive:
   * every existing caller passing nothing keeps its current behavior.
   */
  login(overrideAccessToken?: string): Promise<BrokerSession>;
  refresh(session: BrokerSession): Promise<BrokerSession>;
  logout(session: BrokerSession): Promise<void>;
  /** Local, network-free expiry check — remote health checks are Broker Health Monitor's job (a later phase). */
  validateSession(session: BrokerSession): boolean;
}
