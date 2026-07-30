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
  BROKER_AUTH,
  BROKER_NAME_DHAN,
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

/**
 * Owns the single active broker session for this process: restoring it from
 * secure storage on startup, logging in, refreshing, and logging out — all
 * while publishing the events other modules (audit/app logs, future Broker
 * Health Monitor) observe rather than calling them directly.
 */
@Injectable()
export class BrokerSessionManager implements OnModuleInit, OnModuleDestroy {
  private currentSession: BrokerSession | null = null;
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
  ) {}

  async onModuleInit(): Promise<void> {
    const stored = await this.tokenRepository.find(
      SYSTEM_USER_ID,
      BROKER_NAME_DHAN,
    );
    if (stored && this.brokerAuth.validateSession(stored)) {
      this.currentSession = stored;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.currentSession) {
      await this.logout().catch(() => undefined);
    }
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
    if (this.currentSession) {
      return this.refresh();
    }
    return this.login();
  }

  async login(): Promise<BrokerSession> {
    if (this.pendingAuth) {
      return this.pendingAuth;
    }
    this.pendingAuth = this.performLogin();
    try {
      return await this.pendingAuth;
    } finally {
      this.pendingAuth = null;
    }
  }

  async refresh(): Promise<BrokerSession> {
    if (this.pendingAuth) {
      return this.pendingAuth;
    }
    if (!this.currentSession) {
      return this.login();
    }
    this.pendingAuth = this.performRefresh(this.currentSession);
    try {
      return await this.pendingAuth;
    } finally {
      this.pendingAuth = null;
    }
  }

  private async performLogin(): Promise<BrokerSession> {
    this.eventBus.publish(new BrokerLoginStartedEvent());
    try {
      const session = await this.brokerAuth.login();
      this.currentSession = session;
      await this.tokenRepository.save(
        SYSTEM_USER_ID,
        BROKER_NAME_DHAN,
        session,
      );
      this.eventBus.publish(new BrokerLoginSucceededEvent(session.clientCode));
      return session;
    } catch (error) {
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
      await this.tokenRepository.save(
        SYSTEM_USER_ID,
        BROKER_NAME_DHAN,
        refreshed,
      );
      this.eventBus.publish(
        new BrokerSessionRefreshedEvent(refreshed.clientCode),
      );
      return refreshed;
    } catch (error) {
      const clientCode = session.clientCode;
      this.currentSession = null;
      await this.tokenRepository.clear(SYSTEM_USER_ID, BROKER_NAME_DHAN);
      this.eventBus.publish(new BrokerSessionExpiredEvent(clientCode));
      throw error;
    }
  }

  async logout(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const clientCode = this.currentSession.clientCode;
    await this.brokerAuth.logout(this.currentSession);
    await this.tokenRepository.clear(SYSTEM_USER_ID, BROKER_NAME_DHAN);
    this.currentSession = null;
    this.eventBus.publish(new BrokerLogoutCompletedEvent(clientCode));
  }

  private describeError(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Unknown broker login failure';
  }
}
