import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
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

export type BrokerAuthState =
  'AUTHENTICATED' | 'DISCONNECTED' | 'REAUTH_REQUIRED';

interface AccountSessionState {
  session: BrokerSession | null;
  /**
   * Distinguishes "no session because nothing has ever been attempted / a
   * deliberate logout" (DISCONNECTED) from "an authentication or renewal
   * attempt was made and failed" (REAUTH_REQUIRED) — both leave `session`
   * null, but only the latter means a human needs to paste a fresh token
   * via the reconnect endpoint. Reset to false on any successful
   * login/refresh/reconnect and on a deliberate logout.
   */
  reauthRequired: boolean;
  lastRefreshedAt: Date | null;
  lastAuthEventAt: Date | null;
  /**
   * Single-flight guard for login()/refresh(), scoped per account. Without
   * this, two callers hitting the same account's expired session at nearly
   * the same time would each independently call the real broker auth
   * endpoint — wasteful for login, actively dangerous for refresh (DhanHQ's
   * RenewToken invalidates the token it's called with). Every concurrent
   * caller for *that account* now shares the exact same in-flight attempt;
   * a different account's concurrent auth is entirely independent.
   */
  pendingAuth: Promise<BrokerSession> | null;
}

function createEmptyState(): AccountSessionState {
  return {
    session: null,
    reauthRequired: false,
    lastRefreshedAt: null,
    lastAuthEventAt: null,
    pendingAuth: null,
  };
}

/**
 * Owns one independent broker session per `BrokerAccount` (keyed by
 * `accountId`) — not a single process-wide session. Two accounts (whether
 * owned by the same user or different users) never share state: refreshing,
 * expiring, or logging out one account's session has zero effect on any
 * other account's. Every public method takes the `accountId` it operates
 * on; there is deliberately no "the current session" concept left.
 */
@Injectable()
export class BrokerSessionManager implements OnModuleDestroy {
  private readonly states = new Map<string, AccountSessionState>();

  constructor(
    @Inject(BROKER_AUTH) private readonly brokerAuth: IBrokerAuth,
    @Inject(BROKER_TOKEN_REPOSITORY)
    private readonly tokenRepository: IBrokerTokenRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(ACTIVE_BROKER_NAME) private readonly brokerName: string,
  ) {}

  /** Graceful shutdown: logs out every account that currently holds a session, independently — one account's logout failure never blocks another's. */
  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      this.getAllActiveAccountIds().map((accountId) =>
        this.logout(accountId).catch(() => undefined),
      ),
    );
  }

  private stateFor(accountId: string): AccountSessionState {
    let state = this.states.get(accountId);
    if (!state) {
      state = createEmptyState();
      this.states.set(accountId, state);
    }
    return state;
  }

  /** Every account that currently holds a session in memory — used by the token-renewal scheduler, health indicators, and recovery to iterate instead of assuming one global session. */
  getAllActiveAccountIds(): string[] {
    return [...this.states.entries()]
      .filter(([, state]) => state.session !== null)
      .map(([accountId]) => accountId);
  }

  async restoreSession(accountId: string): Promise<BrokerSession | null> {
    const state = this.stateFor(accountId);
    const stored = await this.tokenRepository.find(accountId, this.brokerName);
    if (stored) {
      if (this.brokerAuth.validateSession(stored)) {
        state.session = stored;
        state.reauthRequired = false;
        return stored;
      } else {
        state.session = null;
        state.reauthRequired = true;
        return null;
      }
    }
    state.session = null;
    state.reauthRequired = false;
    return null;
  }

  getActiveSession(accountId: string): BrokerSession | null {
    return this.states.get(accountId)?.session ?? null;
  }

  isSessionValid(accountId: string): boolean {
    const session = this.getActiveSession(accountId);
    return session !== null && this.brokerAuth.validateSession(session);
  }

  async ensureSession(accountId: string): Promise<BrokerSession> {
    const state = this.stateFor(accountId);
    if (state.pendingAuth) {
      return state.pendingAuth;
    }
    if (state.session && this.brokerAuth.validateSession(state.session)) {
      return state.session;
    }
    const restored = await this.restoreSession(accountId);
    if (restored) {
      return restored;
    }
    state.reauthRequired = true;
    throw new BrokerSessionExpiredException(
      `No active broker session exists for this account. Reauthentication is required.`,
    );
  }

  async login(
    accountId: string,
    overrideAccessToken?: string,
    overrideClientId?: string,
  ): Promise<BrokerSession> {
    const state = this.stateFor(accountId);
    if (state.pendingAuth) {
      return state.pendingAuth;
    }
    state.pendingAuth = this.performLogin(
      accountId,
      overrideAccessToken,
      overrideClientId,
    );
    try {
      return await state.pendingAuth;
    } finally {
      state.pendingAuth = null;
    }
  }

  /**
   * Manual reconnect flow: either an operator pasting a freshly
   * console-generated Dhan access token, or a per-user `BrokerAccount`
   * being activated (which supplies its own `clientId` so the resulting
   * session is correctly attributed instead of falling back to any
   * env-configured one). Reuses the same per-account single-flight guard
   * as login()/refresh().
   */
  async reconnectWithToken(
    accountId: string,
    accessToken: string,
    clientId?: string,
  ): Promise<BrokerSession> {
    return this.login(accountId, accessToken, clientId);
  }

  /**
   * Called for a specific account when its owning user is restored into
   * LIVE mode (at process boot, for every user persisted as LIVE with a
   * `selectedBrokerAccountId` — see `RecoveryCoordinatorService`). Renews
   * an existing session immediately, or falls back to `login()` only when
   * nothing was ever persisted for this account. Never throws — a failed
   * bootstrap leaves that one account in REAUTH_REQUIRED without affecting
   * any other account or crashing the process.
   */
  async bootstrapLiveSession(accountId: string): Promise<void> {
    const state = this.stateFor(accountId);
    try {
      if (state.session) {
        await this.refresh(accountId);
      } else if (!state.reauthRequired) {
        await this.login(accountId);
      }
    } catch {
      // performLogin/performRefresh already recorded REAUTH_REQUIRED and
      // published the relevant failure event for this account — nothing
      // further to do here beyond ensuring the process keeps booting.
    }
  }

  async refresh(accountId: string): Promise<BrokerSession> {
    const state = this.stateFor(accountId);
    if (state.pendingAuth) {
      return state.pendingAuth;
    }
    if (!state.session) {
      state.reauthRequired = true;
      throw new BrokerSessionExpiredException(
        'No active broker session exists for this account to refresh. Reauthentication is required.',
      );
    }
    state.pendingAuth = this.performRefresh(accountId, state.session);
    try {
      return await state.pendingAuth;
    } finally {
      state.pendingAuth = null;
    }
  }

  private async performLogin(
    accountId: string,
    overrideAccessToken?: string,
    overrideClientId?: string,
  ): Promise<BrokerSession> {
    const state = this.stateFor(accountId);
    this.eventBus.publish(new BrokerLoginStartedEvent());
    try {
      const session = await this.brokerAuth.login(
        overrideAccessToken,
        overrideClientId,
      );
      state.session = session;
      state.reauthRequired = false;
      state.lastRefreshedAt = new Date();
      state.lastAuthEventAt = state.lastRefreshedAt;
      await this.tokenRepository.save(accountId, this.brokerName, session);
      this.eventBus.publish(new BrokerLoginSucceededEvent(session.clientCode));
      return session;
    } catch (error) {
      state.reauthRequired = true;
      state.lastAuthEventAt = new Date();
      this.eventBus.publish(
        new BrokerLoginFailedEvent(this.describeError(error)),
      );
      throw error;
    }
  }

  private async performRefresh(
    accountId: string,
    session: BrokerSession,
  ): Promise<BrokerSession> {
    const state = this.stateFor(accountId);
    try {
      const refreshed = await this.brokerAuth.refresh(session);
      state.session = refreshed;
      state.reauthRequired = false;
      state.lastRefreshedAt = new Date();
      state.lastAuthEventAt = state.lastRefreshedAt;
      await this.tokenRepository.save(accountId, this.brokerName, refreshed);
      this.eventBus.publish(
        new BrokerSessionRefreshedEvent(refreshed.clientCode),
      );
      return refreshed;
    } catch (error) {
      const clientCode = session.clientCode;
      state.session = null;
      state.reauthRequired = true;
      state.lastAuthEventAt = new Date();
      await this.tokenRepository.clear(accountId, this.brokerName);
      this.eventBus.publish(new BrokerSessionExpiredEvent(clientCode));
      throw error;
    }
  }

  /**
   * Deliberate teardown for one account — used both by the authenticated
   * broker-disconnect endpoint and by `TradingModeService`'s commit step
   * when a user switches away from LIVE. Not a failure: leaves
   * `getAuthState(accountId)` at DISCONNECTED, never REAUTH_REQUIRED.
   */
  async logout(accountId: string): Promise<void> {
    const state = this.stateFor(accountId);
    if (!state.session) {
      return;
    }

    const clientCode = state.session.clientCode;
    await this.brokerAuth.logout(state.session);
    await this.tokenRepository.clear(accountId, this.brokerName);
    state.session = null;
    state.reauthRequired = false;
    this.eventBus.publish(new BrokerLogoutCompletedEvent(clientCode));
  }

  unloadSession(accountId: string): void {
    const state = this.states.get(accountId);
    if (state) {
      state.session = null;
    }
  }

  /**
   * AUTHENTICATED: a valid session exists right now for this account.
   * REAUTH_REQUIRED: a login/refresh attempt for this account was made and
   * failed — a human must supply a fresh token before any LIVE order for
   * this account can be placed.
   * DISCONNECTED: no session exists for this account and none was ever
   * attempted (or one was deliberately torn down).
   */
  getAuthState(accountId: string): BrokerAuthState {
    const state = this.states.get(accountId);
    if (state?.session && this.brokerAuth.validateSession(state.session)) {
      return 'AUTHENTICATED';
    }
    return state?.reauthRequired ? 'REAUTH_REQUIRED' : 'DISCONNECTED';
  }

  getLastRefreshedAt(accountId: string): Date | null {
    return this.states.get(accountId)?.lastRefreshedAt ?? null;
  }

  getLastAuthEventAt(accountId: string): Date | null {
    return this.states.get(accountId)?.lastAuthEventAt ?? null;
  }

  private describeError(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Unknown broker login failure';
  }
}
