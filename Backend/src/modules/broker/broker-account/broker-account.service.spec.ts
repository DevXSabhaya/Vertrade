import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { BrokerRegistry } from '../registry/broker-registry.service';
import { BrokerId } from '../registry/models/broker-id.enum';
import { NO_FEATURE_FLAGS } from '../registry/models/broker-feature-flags.model';
import type { BrokerDefinition } from '../registry/interfaces/broker-definition.interface';
import { PlaceholderBrokerAuth } from '../registry/placeholder/placeholder-broker-auth';
import { PlaceholderBrokerExecutor } from '../registry/placeholder/placeholder-broker-executor';
import { BrokerNotImplementedException } from '../registry/exceptions/broker-not-implemented.exception';
import { BrokerAccountService } from './broker-account.service';
import { BrokerAccountNotFoundException } from './exceptions/broker-account-not-found.exception';
import type { IBrokerAccountRepository } from './repository/broker-account-repository.interface';
import type { BrokerAccount } from './models/broker-account.model';

function definition(id: BrokerId, isImplemented: boolean): BrokerDefinition {
  return {
    metadata: {
      id,
      displayName: id,
      capabilities: [],
      featureFlags: NO_FEATURE_FLAGS,
      isImplemented,
    },
    auth: new PlaceholderBrokerAuth(id),
    executor: new PlaceholderBrokerExecutor(id),
  };
}

function account(overrides: Partial<BrokerAccount> = {}): BrokerAccount {
  return {
    accountId: 'acc-1',
    userId: 'user-1',
    brokerId: BrokerId.DHAN,
    displayName: 'My Dhan',
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastConnectedAt: null,
    lastError: null,
    ...overrides,
  };
}

describe('BrokerAccountService', () => {
  let repository: jest.Mocked<IBrokerAccountRepository>;
  let registry: BrokerRegistry;
  let sessionManager: jest.Mocked<
    Pick<BrokerSessionManager, 'reconnectWithToken' | 'logout' | 'getAuthState'>
  >;
  let eventBus: jest.Mocked<IEventBus>;
  let service: BrokerAccountService;

  beforeEach(() => {
    repository = {
      create: jest.fn().mockResolvedValue(undefined),
      findAllByUser: jest.fn(),
      findById: jest.fn(),
      getCredentials: jest.fn(),
      deactivateAllForUser: jest.fn().mockResolvedValue(undefined),
      markActive: jest.fn(),
      recordConnectionOutcome: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    registry = new BrokerRegistry([
      definition(BrokerId.DHAN, true),
      definition(BrokerId.ANGEL_ONE, false),
    ]);
    sessionManager = {
      reconnectWithToken: jest.fn(),
      logout: jest.fn().mockResolvedValue(undefined),
      getAuthState: jest.fn().mockReturnValue('DISCONNECTED'),
    };
    eventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    service = new BrokerAccountService(
      repository,
      registry,
      sessionManager as unknown as BrokerSessionManager,
      eventBus,
    );
  });

  describe('addAccount', () => {
    it('persists a new account and publishes an event', async () => {
      const created = await service.addAccount(
        'user-1',
        BrokerId.DHAN,
        'My Dhan',
        { clientId: 'C1', accessToken: 'T1' },
      );

      expect(created.isActive).toBe(false);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', brokerId: BrokerId.DHAN }),
        { clientId: 'C1', accessToken: 'T1' },
      );
      expect(eventBus.publish).toHaveBeenCalled();
    });

    it('allows adding an account for a not-yet-implemented broker', async () => {
      await expect(
        service.addAccount('user-1', BrokerId.ANGEL_ONE, 'My Angel One', {
          clientId: 'C1',
          accessToken: 'T1',
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('getAccount', () => {
    it('throws BrokerAccountNotFoundException when missing', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getAccount('user-1', 'missing')).rejects.toThrow(
        BrokerAccountNotFoundException,
      );
    });
  });

  describe('activate', () => {
    it('reconnects using the stored credentials, deactivates other accounts, and marks this one active', async () => {
      const target = account({ accountId: 'acc-1' });
      repository.findById.mockResolvedValue(target);
      repository.getCredentials.mockResolvedValue({
        clientId: 'C1',
        accessToken: 'T1',
      });
      repository.markActive.mockResolvedValue({ ...target, isActive: true });

      const result = await service.activate('user-1', 'acc-1');

      expect(sessionManager.reconnectWithToken).toHaveBeenCalledWith(
        'T1',
        'C1',
      );
      expect(repository.deactivateAllForUser).toHaveBeenCalledWith('user-1');
      expect(repository.markActive).toHaveBeenCalledWith('user-1', 'acc-1');
      expect(result.isActive).toBe(true);
      expect(eventBus.publish).toHaveBeenCalled();
    });

    it('refuses to activate an account for a not-yet-implemented broker, without touching the session', async () => {
      repository.findById.mockResolvedValue(
        account({ brokerId: BrokerId.ANGEL_ONE }),
      );

      await expect(service.activate('user-1', 'acc-1')).rejects.toThrow(
        BrokerNotImplementedException,
      );
      expect(sessionManager.reconnectWithToken).not.toHaveBeenCalled();
    });

    it('records the failure and rethrows when the broker rejects the credentials', async () => {
      repository.findById.mockResolvedValue(account());
      repository.getCredentials.mockResolvedValue({
        clientId: 'C1',
        accessToken: 'bad-token',
      });
      sessionManager.reconnectWithToken.mockRejectedValue(
        new Error('invalid token'),
      );

      await expect(service.activate('user-1', 'acc-1')).rejects.toThrow(
        'invalid token',
      );
      expect(repository.recordConnectionOutcome).toHaveBeenCalledWith(
        'user-1',
        'acc-1',
        'invalid token',
      );
      expect(repository.deactivateAllForUser).not.toHaveBeenCalled();
    });
  });

  describe('reconnect', () => {
    it('is a no-op when already authenticated', async () => {
      sessionManager.getAuthState.mockReturnValue('AUTHENTICATED');
      repository.findById.mockResolvedValue(account({ isActive: true }));

      await service.reconnect('user-1', 'acc-1');

      expect(sessionManager.reconnectWithToken).not.toHaveBeenCalled();
    });

    it('re-activates when the session has expired', async () => {
      sessionManager.getAuthState.mockReturnValue('REAUTH_REQUIRED');
      repository.findById.mockResolvedValue(account());
      repository.getCredentials.mockResolvedValue({
        clientId: 'C1',
        accessToken: 'T1',
      });
      repository.markActive.mockResolvedValue(account({ isActive: true }));

      await service.reconnect('user-1', 'acc-1');

      expect(sessionManager.reconnectWithToken).toHaveBeenCalledWith(
        'T1',
        'C1',
      );
    });
  });

  describe('disconnect', () => {
    it('tears down only the runtime session, leaving the saved record untouched', async () => {
      repository.findById.mockResolvedValue(account({ isActive: true }));

      const result = await service.disconnect('user-1', 'acc-1');

      expect(sessionManager.logout).toHaveBeenCalled();
      expect(repository.delete).not.toHaveBeenCalled();
      expect(result.isActive).toBe(true); // record itself is unchanged
    });
  });

  describe('remove', () => {
    it('logs out first when removing the active account, then deletes the record', async () => {
      repository.findById.mockResolvedValue(account({ isActive: true }));

      await service.remove('user-1', 'acc-1');

      expect(sessionManager.logout).toHaveBeenCalled();
      expect(repository.delete).toHaveBeenCalledWith('user-1', 'acc-1');
    });

    it('does not log out when removing an inactive account', async () => {
      repository.findById.mockResolvedValue(account({ isActive: false }));

      await service.remove('user-1', 'acc-1');

      expect(sessionManager.logout).not.toHaveBeenCalled();
      expect(repository.delete).toHaveBeenCalledWith('user-1', 'acc-1');
    });
  });

  describe('getRuntimeStatus', () => {
    it('reports NOT_IMPLEMENTED for a placeholder broker regardless of isActive', () => {
      expect(
        service.getRuntimeStatus(
          account({ brokerId: BrokerId.ANGEL_ONE, isActive: true }),
        ),
      ).toBe('NOT_IMPLEMENTED');
    });

    it('reports NOT_CONNECTED for an inactive implemented-broker account', () => {
      expect(service.getRuntimeStatus(account({ isActive: false }))).toBe(
        'NOT_CONNECTED',
      );
    });

    it('reports CONNECTED for an active account with an authenticated session', () => {
      sessionManager.getAuthState.mockReturnValue('AUTHENTICATED');
      expect(service.getRuntimeStatus(account({ isActive: true }))).toBe(
        'CONNECTED',
      );
    });

    it('reports REAUTH_REQUIRED for an active account whose session expired', () => {
      sessionManager.getAuthState.mockReturnValue('REAUTH_REQUIRED');
      expect(service.getRuntimeStatus(account({ isActive: true }))).toBe(
        'REAUTH_REQUIRED',
      );
    });
  });
});
