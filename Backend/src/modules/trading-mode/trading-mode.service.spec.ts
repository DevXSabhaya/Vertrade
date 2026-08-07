import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { ConfigService } from '@core/config/config.service';
import type { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import type { BrokerAccountService } from '@modules/broker/broker-account/broker-account.service';
import type { BrokerAccount } from '@modules/broker/broker-account/models/broker-account.model';
import { BusinessException } from '@common/exceptions/business.exception';
import { TradingModeService } from './trading-mode.service';
import { TradingModeChangedEvent } from './events/trading-mode-changed.event';
import type { IUserTradingPreferenceRepository } from './repository/user-trading-preference-repository.interface';
import type { UserTradingPreference } from './models/user-trading-preference.model';

function account(overrides: Partial<BrokerAccount> = {}): BrokerAccount {
  return {
    accountId: 'acc-1',
    userId: 'user-1',
    brokerId: 'DHAN' as BrokerAccount['brokerId'],
    displayName: 'My Dhan',
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastConnectedAt: null,
    lastError: null,
    ...overrides,
  };
}

describe('TradingModeService', () => {
  let preferenceStore: Map<string, UserTradingPreference>;
  let preferenceRepository: jest.Mocked<IUserTradingPreferenceRepository>;
  let configService: { tradingMode: 'PAPER' | 'LIVE' };
  let brokerSessionManager: jest.Mocked<
    Pick<BrokerSessionManager, 'unloadSession'>
  >;
  let brokerAccountService: jest.Mocked<
    Pick<BrokerAccountService, 'listAccounts' | 'reconnect'>
  >;
  let publishSpy: jest.Mock;
  let eventBus: IEventBus;
  let service: TradingModeService;

  function setPreference(
    userId: string,
    preference: UserTradingPreference,
  ): void {
    preferenceStore.set(userId, preference);
  }

  beforeEach(() => {
    preferenceStore = new Map();
    preferenceRepository = {
      find: jest.fn((userId: string) =>
        Promise.resolve(preferenceStore.get(userId) ?? null),
      ),
      findAllLiveWithBroker: jest.fn().mockResolvedValue([]),
      upsert: jest.fn((userId: string, patch) => {
        const updated: UserTradingPreference = {
          userId,
          tradingMode: patch.tradingMode,
          selectedBrokerAccountId: patch.selectedBrokerAccountId,
          updatedAt: new Date(),
        };
        preferenceStore.set(userId, updated);
        return Promise.resolve(updated);
      }),
    };
    configService = { tradingMode: 'PAPER' };
    brokerSessionManager = {
      unloadSession: jest.fn(),
    };
    brokerAccountService = {
      listAccounts: jest.fn().mockResolvedValue([account()]),
      reconnect: jest.fn().mockResolvedValue(account({ isActive: true })),
    };
    publishSpy = jest.fn();
    eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };

    service = new TradingModeService(
      preferenceRepository,
      configService as unknown as ConfigService,
      brokerSessionManager as unknown as BrokerSessionManager,
      brokerAccountService as unknown as BrokerAccountService,
      eventBus,
    );
  });

  describe('getCurrentMode', () => {
    it('falls back to the env default when no override has ever been persisted', async () => {
      await expect(service.getCurrentMode('user-1')).resolves.toBe('PAPER');
    });

    it('returns the persisted override once one exists, ignoring the env default', async () => {
      setPreference('user-1', {
        userId: 'user-1',
        tradingMode: 'LIVE',
        selectedBrokerAccountId: 'acc-1',
        updatedAt: new Date(),
      });

      await expect(service.getCurrentMode('user-1')).resolves.toBe('LIVE');
    });
  });

  describe('setMode', () => {
    it('switches to PAPER, tearing down the broker session for the previously selected account', async () => {
      setPreference('user-1', {
        userId: 'user-1',
        tradingMode: 'LIVE',
        selectedBrokerAccountId: 'acc-1',
        updatedAt: new Date(),
      });

      await service.setMode('user-1', 'PAPER', 'user-1');

      await expect(service.getCurrentMode('user-1')).resolves.toBe('PAPER');
      expect(brokerSessionManager.unloadSession).toHaveBeenCalledWith('acc-1');
      expect(preferenceRepository.upsert).toHaveBeenCalledWith('user-1', {
        tradingMode: 'PAPER',
        selectedBrokerAccountId: null,
      });
    });

    it('is a no-op (never re-validates or re-publishes) when already in the requested mode', async () => {
      await service.setMode('user-1', 'PAPER', 'user-1');
      expect(publishSpy).not.toHaveBeenCalled();
      expect(preferenceRepository.upsert).not.toHaveBeenCalled();
    });

    it('switches to LIVE only after confirming the selected broker account authenticates', async () => {
      await service.setMode('user-1', 'LIVE', 'user-1', 'acc-1');

      expect(brokerAccountService.reconnect).toHaveBeenCalledWith(
        'user-1',
        'acc-1',
      );
      await expect(service.getCurrentMode('user-1')).resolves.toBe('LIVE');
      expect(publishSpy).toHaveBeenCalledWith(
        expect.any(TradingModeChangedEvent),
      );
    });

    it('refuses to switch to LIVE when the user owns no broker accounts — never silently proceeds', async () => {
      brokerAccountService.listAccounts.mockResolvedValue([]);

      await expect(
        service.setMode('user-1', 'LIVE', 'user-1', 'acc-1'),
      ).rejects.toThrow(BusinessException);
      expect(brokerAccountService.reconnect).not.toHaveBeenCalled();
      await expect(service.getCurrentMode('user-1')).resolves.toBe('PAPER');
      expect(preferenceRepository.upsert).not.toHaveBeenCalled();
    });

    it('refuses to switch to LIVE when the broker account cannot authenticate — mode stays unchanged, no fallback', async () => {
      brokerAccountService.reconnect.mockRejectedValue(
        new Error('invalid credentials'),
      );

      await expect(
        service.setMode('user-1', 'LIVE', 'user-1', 'acc-1'),
      ).rejects.toThrow(BusinessException);
      await expect(service.getCurrentMode('user-1')).resolves.toBe('PAPER');
      expect(preferenceRepository.upsert).not.toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });

    it('persists the preference before publishing the mode-changed event', async () => {
      const callOrder: string[] = [];
      preferenceRepository.upsert.mockImplementation((userId, patch) => {
        const updated: UserTradingPreference = {
          userId,
          tradingMode: patch.tradingMode,
          selectedBrokerAccountId: patch.selectedBrokerAccountId,
          updatedAt: new Date(),
        };
        preferenceStore.set(userId, updated);
        callOrder.push('preference');
        return Promise.resolve(updated);
      });
      publishSpy.mockImplementation(() => {
        callOrder.push('event');
      });

      await service.setMode('user-1', 'LIVE', 'user-1', 'acc-1');

      expect(callOrder).toEqual(['preference', 'event']);
    });

    describe('single-flight / concurrency', () => {
      it('collapses concurrent identical-target calls for the same user into exactly one real switch', async () => {
        let resolveReconnect: (() => void) | undefined;
        brokerAccountService.reconnect.mockReturnValue(
          new Promise((resolve) => {
            resolveReconnect = () => resolve(account({ isActive: true }));
          }),
        );

        const calls = Array.from({ length: 25 }, () =>
          service.setMode('user-1', 'LIVE', 'user-1', 'acc-1'),
        );
        resolveReconnect?.();
        const results = await Promise.all(calls);

        expect(results.every((mode) => mode === 'LIVE')).toBe(true);
        expect(brokerAccountService.reconnect).toHaveBeenCalledTimes(1);
        expect(preferenceRepository.upsert).toHaveBeenCalledTimes(1);
      });

      it('serializes different-target concurrent calls for the same user rather than interleaving', async () => {
        const first = service.setMode('user-1', 'LIVE', 'user-1', 'acc-1');
        const second = service.setMode('user-1', 'PAPER', 'user-1');

        await Promise.all([first, second]);

        await expect(service.getCurrentMode('user-1')).resolves.toBe('PAPER');
      });

      it('a failed switch does not block a subsequent differently-targeted switch from proceeding', async () => {
        brokerAccountService.listAccounts.mockResolvedValueOnce([]);
        await expect(
          service.setMode('user-1', 'LIVE', 'user-1', 'acc-1'),
        ).rejects.toThrow();

        const result = await service.setMode(
          'user-1',
          'LIVE',
          'user-1',
          'acc-1',
        );

        expect(result).toBe('LIVE');
      });

      it('survives 200 sequential PAPER<->LIVE switches, ending in a consistent state', async () => {
        let mode: 'PAPER' | 'LIVE' = 'PAPER';
        for (let i = 0; i < 200; i += 1) {
          mode = mode === 'PAPER' ? 'LIVE' : 'PAPER';

          await service.setMode(`user-${i}`, mode, `user-${i}`, 'acc-1');
          await expect(service.getCurrentMode(`user-${i}`)).resolves.toBe(mode);
        }
      });
    });
  });
});
