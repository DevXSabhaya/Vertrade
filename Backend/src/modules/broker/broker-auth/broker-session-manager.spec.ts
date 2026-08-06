import { BrokerSessionManager } from './broker-session-manager';
import { BrokerSession } from './entities/broker-session.entity';
import { BrokerToken } from './value-objects/broker-token.vo';
import type { IBrokerAuth } from './interfaces/broker-auth.interface';
import type { IBrokerTokenRepository } from './interfaces/broker-token-repository.interface';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { BrokerLoginStartedEvent } from './events/broker-login-started.event';
import { BrokerLoginSucceededEvent } from './events/broker-login-succeeded.event';
import { BrokerLoginFailedEvent } from './events/broker-login-failed.event';
import { BrokerSessionRefreshedEvent } from './events/broker-session-refreshed.event';
import { BrokerSessionExpiredEvent } from './events/broker-session-expired.event';
import { BrokerLogoutCompletedEvent } from './events/broker-logout-completed.event';

import { BrokerSessionExpiredException } from './exceptions/broker-session-expired.exception';

function createSession(expiresInMs = 60_000): BrokerSession {
  return new BrokerSession(
    'C123',
    new BrokerToken('access-token'),
    new Date(),
    new Date(Date.now() + expiresInMs),
  );
}

describe('BrokerSessionManager', () => {
  let brokerAuth: jest.Mocked<IBrokerAuth>;
  let tokenRepository: jest.Mocked<IBrokerTokenRepository>;
  let eventBus: jest.Mocked<IEventBus>;
  let manager: BrokerSessionManager;

  beforeEach(() => {
    brokerAuth = {
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      validateSession: jest.fn(),
    };
    tokenRepository = { save: jest.fn(), find: jest.fn(), clear: jest.fn() };
    eventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    manager = new BrokerSessionManager(
      brokerAuth,
      tokenRepository,
      eventBus,
      'dhan',
    );
  });

  describe('onModuleInit', () => {
    it('restores a persisted session that is still valid', async () => {
      const stored = createSession();
      tokenRepository.find.mockResolvedValue(stored);
      brokerAuth.validateSession.mockReturnValue(true);

      await manager.onModuleInit();

      expect(manager.getActiveSession()).toBe(stored);
    });

    it('does not restore a persisted session that is already expired', async () => {
      const stored = createSession();
      tokenRepository.find.mockResolvedValue(stored);
      brokerAuth.validateSession.mockReturnValue(false);

      await manager.onModuleInit();

      expect(manager.getActiveSession()).toBeNull();
    });

    it('leaves the session null when nothing is persisted', async () => {
      tokenRepository.find.mockResolvedValue(null);
      await manager.onModuleInit();
      expect(manager.getActiveSession()).toBeNull();
    });
  });

  describe('login', () => {
    it('publishes Started then Succeeded, persists the session, and returns it', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);

      const result = await manager.login();

      expect(result).toBe(session);
      expect(manager.getActiveSession()).toBe(session);
      expect(tokenRepository.save).toHaveBeenCalledWith(
        'system',
        'dhan',
        session,
      );
      expect(eventBus.publish).toHaveBeenNthCalledWith(
        1,
        expect.any(BrokerLoginStartedEvent),
      );
      expect(eventBus.publish).toHaveBeenNthCalledWith(
        2,
        expect.any(BrokerLoginSucceededEvent),
      );
    });

    it('publishes Started then Failed and rethrows when login fails', async () => {
      const error = new Error('invalid credentials');
      brokerAuth.login.mockRejectedValue(error);

      await expect(manager.login()).rejects.toThrow(error);

      expect(eventBus.publish).toHaveBeenNthCalledWith(
        1,
        expect.any(BrokerLoginStartedEvent),
      );
      expect(eventBus.publish).toHaveBeenNthCalledWith(
        2,
        expect.any(BrokerLoginFailedEvent),
      );
      expect(manager.getActiveSession()).toBeNull();
    });
  });

  describe('refresh', () => {
    it('throws BrokerSessionExpiredException when there is no current session', async () => {
      await expect(manager.refresh()).rejects.toThrow(
        BrokerSessionExpiredException,
      );
      expect(brokerAuth.refresh).not.toHaveBeenCalled();
    });

    it('replaces the session, persists it, and publishes SessionRefreshed on success', async () => {
      const initial = createSession();
      brokerAuth.login.mockResolvedValue(initial);
      await manager.login();
      eventBus.publish.mockClear();

      const refreshed = createSession();
      brokerAuth.refresh.mockResolvedValue(refreshed);

      const result = await manager.refresh();

      expect(result).toBe(refreshed);
      expect(manager.getActiveSession()).toBe(refreshed);
      expect(tokenRepository.save).toHaveBeenCalledWith(
        'system',
        'dhan',
        refreshed,
      );
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.any(BrokerSessionRefreshedEvent),
      );
    });

    it('clears the session and publishes SessionExpired when refresh fails', async () => {
      const initial = createSession();
      brokerAuth.login.mockResolvedValue(initial);
      await manager.login();
      eventBus.publish.mockClear();

      brokerAuth.refresh.mockRejectedValue(new Error('refresh token expired'));

      await expect(manager.refresh()).rejects.toThrow('refresh token expired');

      expect(manager.getActiveSession()).toBeNull();
      expect(tokenRepository.clear).toHaveBeenCalledWith('system', 'dhan');
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.any(BrokerSessionExpiredEvent),
      );
    });
  });

  describe('logout', () => {
    it('does nothing when there is no active session', async () => {
      await manager.logout();
      expect(brokerAuth.logout).not.toHaveBeenCalled();
    });

    it('logs out, clears storage, clears the session, and publishes LogoutCompleted', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);
      await manager.login();

      await manager.logout();

      expect(brokerAuth.logout).toHaveBeenCalledWith(session);
      expect(tokenRepository.clear).toHaveBeenCalledWith('system', 'dhan');
      expect(manager.getActiveSession()).toBeNull();
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.any(BrokerLogoutCompletedEvent),
      );
    });
  });

  describe('ensureSession', () => {
    it('returns the current session without calling the broker when still valid', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);
      await manager.login();
      brokerAuth.validateSession.mockReturnValue(true);

      const result = await manager.ensureSession();

      expect(result).toBe(session);
      expect(brokerAuth.refresh).not.toHaveBeenCalled();
    });

    it('throws BrokerSessionExpiredException when the current session has expired', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);
      await manager.login();
      brokerAuth.validateSession.mockReturnValue(false);

      await expect(manager.ensureSession()).rejects.toThrow(
        BrokerSessionExpiredException,
      );
    });

    it('shares a single in-flight refresh across concurrent callers instead of calling the broker twice', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);
      await manager.login();
      brokerAuth.validateSession.mockReturnValue(true);

      let resolveRefresh: ((session: BrokerSession) => void) | undefined;
      brokerAuth.refresh.mockReturnValue(
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
      );

      const first = manager.refresh();
      const second = manager.refresh();

      const refreshed = createSession();
      resolveRefresh?.(refreshed);
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(brokerAuth.refresh).toHaveBeenCalledTimes(1);
      expect(firstResult).toBe(refreshed);
      expect(secondResult).toBe(refreshed);
    });

    it('shares a single in-flight login across concurrent callers', async () => {
      let resolveLogin: ((session: BrokerSession) => void) | undefined;
      brokerAuth.login.mockReturnValue(
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
      );

      const first = manager.login();
      const second = manager.login();

      const session = createSession();
      resolveLogin?.(session);
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(brokerAuth.login).toHaveBeenCalledTimes(1);
      expect(firstResult).toBe(session);
      expect(secondResult).toBe(session);
    });

    it('throws BrokerSessionExpiredException when there is no current session at all', async () => {
      await expect(manager.ensureSession()).rejects.toThrow(
        BrokerSessionExpiredException,
      );
    });
  });

  describe('getAuthState', () => {
    it('is DISCONNECTED before anything has ever been attempted', () => {
      expect(manager.getAuthState()).toBe('DISCONNECTED');
    });

    it('is AUTHENTICATED once a valid session exists', async () => {
      brokerAuth.login.mockResolvedValue(createSession());
      brokerAuth.validateSession.mockReturnValue(true);
      await manager.login();

      expect(manager.getAuthState()).toBe('AUTHENTICATED');
    });

    it('is REAUTH_REQUIRED after a login failure, not DISCONNECTED', async () => {
      brokerAuth.login.mockRejectedValue(new Error('invalid token'));
      await expect(manager.login()).rejects.toThrow();

      expect(manager.getAuthState()).toBe('REAUTH_REQUIRED');
    });

    it('is REAUTH_REQUIRED after a refresh failure', async () => {
      brokerAuth.login.mockResolvedValue(createSession());
      await manager.login();
      brokerAuth.refresh.mockRejectedValue(new Error('renew failed'));

      await expect(manager.refresh()).rejects.toThrow();
      expect(manager.getAuthState()).toBe('REAUTH_REQUIRED');
    });

    it('returns to DISCONNECTED (not REAUTH_REQUIRED) after a deliberate logout following a prior failure', async () => {
      brokerAuth.login.mockResolvedValueOnce(createSession());
      await manager.login();
      brokerAuth.refresh.mockRejectedValue(new Error('renew failed'));
      await expect(manager.refresh()).rejects.toThrow();
      expect(manager.getAuthState()).toBe('REAUTH_REQUIRED');

      brokerAuth.login.mockResolvedValueOnce(createSession());
      await manager.login();
      await manager.logout();

      expect(manager.getAuthState()).toBe('DISCONNECTED');
    });
  });

  describe('reconnectWithToken', () => {
    it('logs in with the supplied override token via the single-flight login path', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);

      const result = await manager.reconnectWithToken('fresh-token');

      expect(result).toBe(session);
      expect(brokerAuth.login).toHaveBeenCalledWith('fresh-token');
      expect(manager.getAuthState()).toBe('DISCONNECTED');
    });
  });

  describe('bootstrapLiveSession', () => {
    it('refreshes an already-restored session rather than logging in again', async () => {
      brokerAuth.login.mockResolvedValue(createSession());
      await manager.login();
      const refreshed = createSession();
      brokerAuth.refresh.mockResolvedValue(refreshed);

      await manager.bootstrapLiveSession();

      expect(brokerAuth.refresh).toHaveBeenCalledTimes(1);
      expect(brokerAuth.login).toHaveBeenCalledTimes(1);
      expect(manager.getActiveSession()).toBe(refreshed);
    });

    it('logs in with the bootstrap seed when nothing was ever restored', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);

      await manager.bootstrapLiveSession();

      expect(brokerAuth.login).toHaveBeenCalledTimes(1);
      expect(manager.getActiveSession()).toBe(session);
    });

    it('never throws, even when the underlying login/refresh rejects', async () => {
      brokerAuth.login.mockRejectedValue(new Error('expired'));

      await expect(manager.bootstrapLiveSession()).resolves.toBeUndefined();
      expect(manager.getAuthState()).toBe('REAUTH_REQUIRED');
    });
  });

  describe('getLastRefreshedAt / getLastAuthEventAt', () => {
    it('are null before anything has happened', () => {
      expect(manager.getLastRefreshedAt()).toBeNull();
      expect(manager.getLastAuthEventAt()).toBeNull();
    });

    it('are set after a successful login', async () => {
      brokerAuth.login.mockResolvedValue(createSession());
      await manager.login();

      expect(manager.getLastRefreshedAt()).toBeInstanceOf(Date);
      expect(manager.getLastAuthEventAt()).toBeInstanceOf(Date);
    });
  });

  describe('isSessionValid', () => {
    it('is false with no active session', () => {
      expect(manager.isSessionValid()).toBe(false);
    });

    it('reflects IBrokerAuth.validateSession for the active session', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);
      await manager.login();

      brokerAuth.validateSession.mockReturnValue(true);
      expect(manager.isSessionValid()).toBe(true);

      brokerAuth.validateSession.mockReturnValue(false);
      expect(manager.isSessionValid()).toBe(false);
    });
  });
});
