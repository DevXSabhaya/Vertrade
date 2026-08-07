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
  const accountId = 'acc-1';
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

  describe('restoreSession', () => {
    it('restores a persisted session that is still valid', async () => {
      const stored = createSession();
      tokenRepository.find.mockResolvedValue(stored);
      brokerAuth.validateSession.mockReturnValue(true);

      await manager.restoreSession(accountId);

      expect(manager.getActiveSession(accountId)).toBe(stored);
    });

    it('does not restore a persisted session that is already expired', async () => {
      const stored = createSession();
      tokenRepository.find.mockResolvedValue(stored);
      brokerAuth.validateSession.mockReturnValue(false);

      await manager.restoreSession(accountId);

      expect(manager.getActiveSession(accountId)).toBeNull();
    });

    it('leaves the session null when nothing is persisted', async () => {
      tokenRepository.find.mockResolvedValue(null);
      await manager.restoreSession(accountId);
      expect(manager.getActiveSession(accountId)).toBeNull();
    });
  });

  describe('login', () => {
    it('publishes Started then Succeeded, persists the session, and returns it', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);

      const result = await manager.login(accountId);

      expect(result).toBe(session);
      expect(manager.getActiveSession(accountId)).toBe(session);
      expect(tokenRepository.save).toHaveBeenCalledWith(
        accountId,
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

      await expect(manager.login(accountId)).rejects.toThrow(error);

      expect(eventBus.publish).toHaveBeenNthCalledWith(
        1,
        expect.any(BrokerLoginStartedEvent),
      );
      expect(eventBus.publish).toHaveBeenNthCalledWith(
        2,
        expect.any(BrokerLoginFailedEvent),
      );
      expect(manager.getActiveSession(accountId)).toBeNull();
    });
  });

  describe('refresh', () => {
    it('throws BrokerSessionExpiredException when there is no current session', async () => {
      await expect(manager.refresh(accountId)).rejects.toThrow(
        BrokerSessionExpiredException,
      );
      expect(brokerAuth.refresh).not.toHaveBeenCalled();
    });

    it('replaces the session, persists it, and publishes SessionRefreshed on success', async () => {
      const initial = createSession();
      brokerAuth.login.mockResolvedValue(initial);
      await manager.login(accountId);
      eventBus.publish.mockClear();

      const refreshed = createSession();
      brokerAuth.refresh.mockResolvedValue(refreshed);

      const result = await manager.refresh(accountId);

      expect(result).toBe(refreshed);
      expect(manager.getActiveSession(accountId)).toBe(refreshed);
      expect(tokenRepository.save).toHaveBeenCalledWith(
        accountId,
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
      await manager.login(accountId);
      eventBus.publish.mockClear();

      brokerAuth.refresh.mockRejectedValue(new Error('refresh token expired'));

      await expect(manager.refresh(accountId)).rejects.toThrow(
        'refresh token expired',
      );

      expect(manager.getActiveSession(accountId)).toBeNull();
      expect(tokenRepository.clear).toHaveBeenCalledWith(accountId, 'dhan');
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.any(BrokerSessionExpiredEvent),
      );
    });
  });

  describe('logout', () => {
    it('does nothing when there is no active session', async () => {
      await manager.logout(accountId);
      expect(brokerAuth.logout).not.toHaveBeenCalled();
    });

    it('logs out, clears storage, clears the session, and publishes LogoutCompleted', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);
      await manager.login(accountId);

      await manager.logout(accountId);

      expect(brokerAuth.logout).toHaveBeenCalledWith(session);
      expect(tokenRepository.clear).toHaveBeenCalledWith(accountId, 'dhan');
      expect(manager.getActiveSession(accountId)).toBeNull();
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.any(BrokerLogoutCompletedEvent),
      );
    });
  });

  describe('ensureSession', () => {
    it('returns the current session without calling the broker when still valid', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);
      await manager.login(accountId);
      brokerAuth.validateSession.mockReturnValue(true);

      const result = await manager.ensureSession(accountId);

      expect(result).toBe(session);
      expect(brokerAuth.refresh).not.toHaveBeenCalled();
    });

    it('throws BrokerSessionExpiredException when the current session has expired', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);
      await manager.login(accountId);
      brokerAuth.validateSession.mockReturnValue(false);
      tokenRepository.find.mockResolvedValue(null);

      await expect(manager.ensureSession(accountId)).rejects.toThrow(
        BrokerSessionExpiredException,
      );
    });

    it('shares a single in-flight refresh across concurrent callers instead of calling the broker twice', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);
      await manager.login(accountId);
      brokerAuth.validateSession.mockReturnValue(true);

      let resolveRefresh: ((session: BrokerSession) => void) | undefined;
      brokerAuth.refresh.mockReturnValue(
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
      );

      const first = manager.refresh(accountId);
      const second = manager.refresh(accountId);

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

      const first = manager.login(accountId);
      const second = manager.login(accountId);

      const session = createSession();
      resolveLogin?.(session);
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(brokerAuth.login).toHaveBeenCalledTimes(1);
      expect(firstResult).toBe(session);
      expect(secondResult).toBe(session);
    });

    it('throws BrokerSessionExpiredException when there is no current session at all', async () => {
      tokenRepository.find.mockResolvedValue(null);
      await expect(manager.ensureSession(accountId)).rejects.toThrow(
        BrokerSessionExpiredException,
      );
    });
  });

  describe('getAuthState', () => {
    it('is DISCONNECTED before anything has ever been attempted', () => {
      expect(manager.getAuthState(accountId)).toBe('DISCONNECTED');
    });

    it('is AUTHENTICATED once a valid session exists', async () => {
      brokerAuth.login.mockResolvedValue(createSession());
      brokerAuth.validateSession.mockReturnValue(true);
      await manager.login(accountId);

      expect(manager.getAuthState(accountId)).toBe('AUTHENTICATED');
    });

    it('is REAUTH_REQUIRED after a login failure, not DISCONNECTED', async () => {
      brokerAuth.login.mockRejectedValue(new Error('invalid token'));
      await expect(manager.login(accountId)).rejects.toThrow();

      expect(manager.getAuthState(accountId)).toBe('REAUTH_REQUIRED');
    });

    it('is REAUTH_REQUIRED after a refresh failure', async () => {
      brokerAuth.login.mockResolvedValue(createSession());
      await manager.login(accountId);
      brokerAuth.refresh.mockRejectedValue(new Error('renew failed'));

      await expect(manager.refresh(accountId)).rejects.toThrow();
      expect(manager.getAuthState(accountId)).toBe('REAUTH_REQUIRED');
    });

    it('returns to DISCONNECTED (not REAUTH_REQUIRED) after a deliberate logout following a prior failure', async () => {
      brokerAuth.login.mockResolvedValueOnce(createSession());
      await manager.login(accountId);
      brokerAuth.refresh.mockRejectedValue(new Error('renew failed'));
      await expect(manager.refresh(accountId)).rejects.toThrow();
      expect(manager.getAuthState(accountId)).toBe('REAUTH_REQUIRED');

      brokerAuth.login.mockResolvedValueOnce(createSession());
      await manager.login(accountId);
      await manager.logout(accountId);

      expect(manager.getAuthState(accountId)).toBe('DISCONNECTED');
    });
  });

  describe('reconnectWithToken', () => {
    it('logs in with the supplied override token via the single-flight login path', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);

      const result = await manager.reconnectWithToken(accountId, 'fresh-token');

      expect(result).toBe(session);
      expect(brokerAuth.login).toHaveBeenCalledWith('fresh-token', undefined);
      expect(manager.getAuthState(accountId)).toBe('DISCONNECTED');
    });

    it('forwards the supplied clientId alongside the override token', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);

      await manager.reconnectWithToken(
        accountId,
        'fresh-token',
        'USER-OWNED-ID',
      );

      expect(brokerAuth.login).toHaveBeenCalledWith(
        'fresh-token',
        'USER-OWNED-ID',
      );
    });
  });

  describe('bootstrapLiveSession', () => {
    it('refreshes an already-restored session rather than logging in again', async () => {
      brokerAuth.login.mockResolvedValue(createSession());
      await manager.login(accountId);
      const refreshed = createSession();
      brokerAuth.refresh.mockResolvedValue(refreshed);

      await manager.bootstrapLiveSession(accountId);

      expect(brokerAuth.refresh).toHaveBeenCalledTimes(1);
      expect(brokerAuth.login).toHaveBeenCalledTimes(1);
      expect(manager.getActiveSession(accountId)).toBe(refreshed);
    });

    it('logs in with the bootstrap seed when nothing was ever restored', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);

      await manager.bootstrapLiveSession(accountId);

      expect(brokerAuth.login).toHaveBeenCalledTimes(1);
      expect(manager.getActiveSession(accountId)).toBe(session);
    });

    it('never throws, even when the underlying login/refresh rejects', async () => {
      brokerAuth.login.mockRejectedValue(new Error('expired'));

      await expect(
        manager.bootstrapLiveSession(accountId),
      ).resolves.toBeUndefined();
      expect(manager.getAuthState(accountId)).toBe('REAUTH_REQUIRED');
    });
  });

  describe('getLastRefreshedAt / getLastAuthEventAt', () => {
    it('are null before anything has happened', () => {
      expect(manager.getLastRefreshedAt(accountId)).toBeNull();
      expect(manager.getLastAuthEventAt(accountId)).toBeNull();
    });

    it('are set after a successful login', async () => {
      brokerAuth.login.mockResolvedValue(createSession());
      await manager.login(accountId);

      expect(manager.getLastRefreshedAt(accountId)).toBeInstanceOf(Date);
      expect(manager.getLastAuthEventAt(accountId)).toBeInstanceOf(Date);
    });
  });

  describe('isSessionValid', () => {
    it('is false with no active session', () => {
      expect(manager.isSessionValid(accountId)).toBe(false);
    });

    it('reflects IBrokerAuth.validateSession for the active session', async () => {
      const session = createSession();
      brokerAuth.login.mockResolvedValue(session);
      await manager.login(accountId);

      brokerAuth.validateSession.mockReturnValue(true);
      expect(manager.isSessionValid(accountId)).toBe(true);

      brokerAuth.validateSession.mockReturnValue(false);
      expect(manager.isSessionValid(accountId)).toBe(false);
    });
  });

  describe('getAllActiveAccountIds', () => {
    it('returns only accounts that currently hold a session, independently per account', async () => {
      expect(manager.getAllActiveAccountIds()).toEqual([]);

      brokerAuth.login.mockResolvedValue(createSession());
      await manager.login('acc-1');
      await manager.login('acc-2');

      expect(manager.getAllActiveAccountIds().sort()).toEqual([
        'acc-1',
        'acc-2',
      ]);

      await manager.logout('acc-1');

      expect(manager.getAllActiveAccountIds()).toEqual(['acc-2']);
    });
  });
});
