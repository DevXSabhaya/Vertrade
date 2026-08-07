import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { SYSTEM_USER_ID } from '@shared/constants/system-user.constant';
import {
  ACTIVE_BROKER_NAME,
  BROKER_AUTH,
  BROKER_TOKEN_REPOSITORY,
} from './broker-auth.constants';
import type { IBrokerAuth } from './interfaces/broker-auth.interface';
import type { IBrokerTokenRepository } from './interfaces/broker-token-repository.interface';
import { BrokerSession } from './entities/broker-session.entity';
import { BrokerLoginStartedEvent } from './events/broker-login-started.event';
import { BrokerLoginSucceededEvent } from './events/broker-login-succeeded.event';
import { BrokerLoginFailedEvent } from './events/broker-login-failed.event';
import { BrokerSessionRefreshedEvent } from './events/broker-session-refreshed.event';
import { BrokerSessionExpiredEvent } from './events/broker-session-expired.event';
import { BrokerLogoutCompletedEvent } from './events/broker-logout-completed.event';

import { BrokerSessionExpiredException } from './exceptions/broker-session-expired.exception';

/**
 * Owns the single active broker session for this process: restoring it from
 * secure storage on startup, logging in, refreshing, and logging out — all
 * while publishing the events other modules (audit/app logs, future Broker
 * Health Monitor) observe rather than calling them directly.
 */
export type BrokerAuthState =
  'AUTHENTICATED' | 'DISCONNECTED' | 'REAUTH_REQUIRED';

@Injectable()
export class BrokerSessionManager implements OnModuleInit, OnModuleDestroy {
  private currentSession: BrokerSession | null = null;
  /**
   * Distinguishes "no session because nothing has ever been attempted / a
   * deliberate logout" (DISCONNECTED) from "an authentication or renewal
   * attempt was made and failed" (REAUTH_REQUIRED) — both leave
   * `currentSession` null, but only the latter means a human needs to paste
   * a fresh token via the reconnect endpoint. Reset to false on any
   * successful login/refresh/reconnect and on a deliberate logout.
   */
  private reauthRequired = false;
  private lastRefreshedAt: Date | null = null;
  private lastAuthEventAt: Date | null = null;
  /**
   * Single-flight guard for login()/refresh(). Without this, two callers
   * hitting an expired session at nearly the same time (e.g. an order
   * placement and the market-data WebSocket both reconnecting) would each
   * independently call the real broker auth endpoint. That's wasteful for
   * login, but actively dangerous for refresh: DhanHQ's RenewToken
   * invalidates the token it's called with and issues a new one, so a
   * second concurrent refresh can invalidate the first refresh's
   * just-issued token before anything gets to use it, or the two
   * `this.currentSession = refreshed` assignments can race and leave the
   * in-memory session and the persisted token repository holding two
   * different tokens. Every concurrent caller now shares the exact same
   * in-flight attempt instead.
   */
  private pendingAuth: Promise<BrokerSession> | null = null;

  constructor(
    @Inject(BROKER_AUTH) private readonly brokerAuth: IBrokerAuth,
    @Inject(BROKER_TOKEN_REPOSITORY)
    private readonly tokenRepository: IBrokerTokenRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(ACTIVE_BROKER_NAME) private readonly brokerName: string,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.restoreSession();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.currentSession) {
      await this.logout().catch(() => undefined);
    }
  }

  async restoreSession(): Promise<BrokerSession | null> {
    const stored = await this.tokenRepository.find(
      SYSTEM_USER_ID,
      this.brokerName,
    );
    if (stored) {
      if (this.brokerAuth.validateSession(stored)) {
        this.currentSession = stored;
        this.reauthRequired = false;
        return stored;
      } else {
        this.currentSession = null;
        this.reauthRequired = true;
        return null;
      }
    }
    this.currentSession = null;
    this.reauthRequired = false;
    return null;
  }

  getActiveSession(): BrokerSession | null {
    return this.currentSession;
  }

  isSessionValid(): boolean {
    return (
      this.currentSession !== null &&
      this.brokerAuth.validateSession(this.currentSession)
    );
  }

  async ensureSession(): Promise<BrokerSession> {
    if (this.pendingAuth) {
      return this.pendingAuth;
    }
    if (
      this.currentSession &&
      this.brokerAuth.validateSession(this.currentSession)
    ) {
      return this.currentSession;
    }
    const restored = await this.restoreSession();
    if (restored) {
      return restored;
    }
    this.reauthRequired = true;
    throw new BrokerSessionExpiredException(
      'No active broker session exists. Reauthentication is required.',
    );
  }

  async login(
    overrideAccessToken?: string,
    overrideClientId?: string,
  ): Promise<BrokerSession> {
    if (this.pendingAuth) {
      return this.pendingAuth;
    }
    this.pendingAuth = this.performLogin(overrideAccessToken, overrideClientId);
    try {
      return await this.pendingAuth;
    } finally {
      this.pendingAuth = null;
    }
  }

  /**
   * Manual reconnect flow: either an operator pasting a freshly
   * console-generated Dhan access token (the only recovery path DhanHQ's
   * individual-API account type supports once a token has genuinely
   * expired — see DhanBrokerAuth's class docstring), or a per-user
   * `BrokerAccount` being activated (which supplies its own `clientId` so
   * the resulting session is correctly attributed instead of silently
   * falling back to the env-configured one). Reuses the same single-flight
   * guard as login()/refresh() so concurrent reconnect calls serialize onto
   * one real attempt rather than each hitting Dhan independently.
   */
  async reconnectWithToken(
    accessToken: string,
    clientId?: string,
  ): Promise<BrokerSession> {
    return this.login(accessToken, clientId);
  }

  /**
   * Called once, at application bootstrap, only when the deployment's
   * persisted trading mode is LIVE (see TradingModeService's
   * OnApplicationBootstrap hook — BrokerSessionManager itself must not
   * depend on TradingModeService, which would be a circular module
   * dependency). Restores maximum freshness for whatever `onModuleInit`
   * already loaded from encrypted storage: renews an existing session
   * immediately (rather than waiting for the next periodic renewal), or
   * falls back to `login()` (the DHAN_ACCESS_TOKEN bootstrap seed) only
   * when nothing was ever persisted. Never throws — a failed bootstrap
   * leaves the deployment in REAUTH_REQUIRED without crashing the process.
   */
  async bootstrapLiveSession(): Promise<void> {
    try {
      if (this.currentSession) {
        await this.refresh();
      } else if (!this.reauthRequired) {
        await this.login();
      }
    } catch {
      // performLogin/performRefresh already recorded REAUTH_REQUIRED and
      // published the relevant failure event — nothing further to do here
      // beyond ensuring the process keeps booting.
    }
  }

  async refresh(): Promise<BrokerSession> {
    if (this.pendingAuth) {
      return this.pendingAuth;
    }
    if (!this.currentSession) {
      this.reauthRequired = true;
      throw new BrokerSessionExpiredException(
        'No active broker session exists to refresh. Reauthentication is required.',
      );
    }
    this.pendingAuth = this.performRefresh(this.currentSession);
    try {
      return await this.pendingAuth;
    } finally {
      this.pendingAuth = null;
    }
  }

  private async performLogin(
    overrideAccessToken?: string,
    overrideClientId?: string,
  ): Promise<BrokerSession> {
    this.eventBus.publish(new BrokerLoginStartedEvent());
    try {
      const session = await this.brokerAuth.login(
        overrideAccessToken,
        overrideClientId,
      );
      this.currentSession = session;
      this.reauthRequired = false;
      this.lastRefreshedAt = new Date();
      this.lastAuthEventAt = this.lastRefreshedAt;
      await this.tokenRepository.save(SYSTEM_USER_ID, this.brokerName, session);
      this.eventBus.publish(new BrokerLoginSucceededEvent(session.clientCode));
      return session;
    } catch (error) {
      this.reauthRequired = true;
      this.lastAuthEventAt = new Date();
      this.eventBus.publish(
        new BrokerLoginFailedEvent(this.describeError(error)),
      );
      throw error;
    }
  }

  private async performRefresh(session: BrokerSession): Promise<BrokerSession> {
    try {
      const refreshed = await this.brokerAuth.refresh(session);
      this.currentSession = refreshed;
      this.reauthRequired = false;
      this.lastRefreshedAt = new Date();
      this.lastAuthEventAt = this.lastRefreshedAt;
      await this.tokenRepository.save(
        SYSTEM_USER_ID,
        this.brokerName,
        refreshed,
      );
      this.eventBus.publish(
        new BrokerSessionRefreshedEvent(refreshed.clientCode),
      );
      return refreshed;
    } catch (error) {
      const clientCode = session.clientCode;
      this.currentSession = null;
      this.reauthRequired = true;
      this.lastAuthEventAt = new Date();
      await this.tokenRepository.clear(SYSTEM_USER_ID, this.brokerName);
      this.eventBus.publish(new BrokerSessionExpiredEvent(clientCode));
      throw error;
    }
  }

  /**
   * Deliberate teardown — used both for the authenticated
   * `POST /config/broker/disconnect` endpoint and by TradingModeService's
   * commit step when switching to PAPER. Not a failure: leaves
   * `getAuthState()` at DISCONNECTED, never REAUTH_REQUIRED.
   */
  async logout(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const clientCode = this.currentSession.clientCode;
    await this.brokerAuth.logout(this.currentSession);
    await this.tokenRepository.clear(SYSTEM_USER_ID, this.brokerName);
    this.currentSession = null;
    this.reauthRequired = false;
    this.eventBus.publish(new BrokerLogoutCompletedEvent(clientCode));
  }

  unloadSession(): void {
    this.currentSession = null;
  }

  /**
   * AUTHENTICATED: a valid session exists right now.
   * REAUTH_REQUIRED: a login/refresh attempt was made and failed — a human
   * must supply a fresh token via the reconnect endpoint before any LIVE
   * order can be placed.
   * DISCONNECTED: no session exists and none was ever attempted (or one was
   * deliberately torn down via logout()/a switch to PAPER) — the normal,
   * non-error state for a PAPER deployment.
   */
  getAuthState(): BrokerAuthState {
    if (
      this.currentSession &&
      this.brokerAuth.validateSession(this.currentSession)
    ) {
      return 'AUTHENTICATED';
    }
    return this.reauthRequired ? 'REAUTH_REQUIRED' : 'DISCONNECTED';
  }

  getLastRefreshedAt(): Date | null {
    return this.lastRefreshedAt;
  }

  getLastAuthEventAt(): Date | null {
    return this.lastAuthEventAt;
  }

  private describeError(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Unknown broker login failure';
  }
}
