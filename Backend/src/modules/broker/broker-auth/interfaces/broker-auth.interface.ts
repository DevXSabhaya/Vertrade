import type { BrokerSession } from '../entities/broker-session.entity';

/**
 * The rest of the application depends only on this interface — never on
 * DhanBrokerAuth directly — so a future Zerodha/Upstox/Fyers/Shoonya
 * broker-auth adapter can be added without touching any consumer.
 */
export interface IBrokerAuth {
  /**
   * @param overrideAccessToken When provided (the manual reconnect flow —
   * an operator pasting a freshly console-generated token, or a per-user
   * `BrokerAccount` being activated), this token is used instead of the
   * configured `DHAN_ACCESS_TOKEN` env value. Additive: every existing
   * caller passing nothing keeps its current behavior.
   * @param overrideClientId The client ID that owns `overrideAccessToken`.
   * Only meaningful alongside `overrideAccessToken` — without it, the
   * resulting session's identity falls back to the env-configured client ID.
   * Ignored when `overrideAccessToken` is not provided.
   */
  login(
    overrideAccessToken?: string,
    overrideClientId?: string,
  ): Promise<BrokerSession>;
  refresh(session: BrokerSession): Promise<BrokerSession>;
  logout(session: BrokerSession): Promise<void>;
  /** Local, network-free expiry check — remote health checks are Broker Health Monitor's job (a later phase). */
  validateSession(session: BrokerSession): boolean;
}
