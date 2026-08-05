import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { ConfigService } from '@core/config/config.service';
import type { SettingsService } from '@modules/settings/settings.service';
import type { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import type { BrokerTokenRenewalScheduler } from '@modules/broker/broker-auth/broker-token-renewal.scheduler';
import type { MarketDataService } from '@modules/market-data/market-data.service';
import type { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import { BusinessException } from '@common/exceptions/business.exception';
import {
  TradingModeService,
  TRADING_MODE_SETTING_KEY,
} from './trading-mode.service';
import { TradingModeChangedEvent } from './events/trading-mode-changed.event';

describe('TradingModeService', () => {
  let settingsStore: Map<string, unknown>;
  let settingsService: { get: jest.Mock; set: jest.Mock };
  let configService: {
    tradingMode: 'PAPER' | 'LIVE';
    hasDhanCredentials: boolean;
  };
  let brokerSessionManager: jest.Mocked<
    Pick<
      BrokerSessionManager,
      'ensureSession' | 'isSessionValid' | 'logout' | 'bootstrapLiveSession' | 'unloadSession'
    >
  >;
  let brokerTokenRenewalScheduler: jest.Mocked<
    Pick<BrokerTokenRenewalScheduler, 'start' | 'stop'>
  >;
  let marketDataService: jest.Mocked<
    Pick<
      MarketDataService,
      | 'initializeForMode'
      | 'prepareProviderForMode'
      | 'commitProviderSwitch'
      | 'abortPreparedProvider'
    >
  >;
  let instrumentMasterService: jest.Mocked<
    Pick<
      InstrumentMasterService,
      | 'initializeForMode'
      | 'refreshIfSourceMismatch'
      | 'prepareRefreshForMode'
      | 'commitInstrumentSwitch'
    >
  >;
  let publishSpy: jest.Mock;
  let eventBus: IEventBus;
  let service: TradingModeService;

  beforeEach(() => {
    settingsStore = new Map();
    settingsService = {
      get: jest.fn(
        <T>(key: string): T | undefined =>
          settingsStore.get(key) as T | undefined,
      ),
      set: jest.fn((key: string, value: unknown) => {
        settingsStore.set(key, value);
        return Promise.resolve({ key, value } as never);
      }),
    };
    configService = { tradingMode: 'PAPER', hasDhanCredentials: true };
    brokerSessionManager = {
      ensureSession: jest.fn().mockResolvedValue({}),
      isSessionValid: jest.fn().mockReturnValue(true),
      logout: jest.fn().mockResolvedValue(undefined),
      bootstrapLiveSession: jest.fn().mockResolvedValue(undefined),
      unloadSession: jest.fn(),
    };
    brokerTokenRenewalScheduler = {
      start: jest.fn(),
      stop: jest.fn(),
    };
    marketDataService = {
      initializeForMode: jest.fn(),
      prepareProviderForMode: jest.fn().mockResolvedValue(undefined),
      commitProviderSwitch: jest.fn().mockResolvedValue(undefined),
      abortPreparedProvider: jest.fn().mockResolvedValue(undefined),
    };
    instrumentMasterService = {
      initializeForMode: jest.fn(),
      refreshIfSourceMismatch: jest.fn().mockResolvedValue(undefined),
      prepareRefreshForMode: jest.fn().mockResolvedValue([{ token: 'X' }]),
      commitInstrumentSwitch: jest.fn().mockResolvedValue(undefined),
    };
    publishSpy = jest.fn();
    eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };

    service = new TradingModeService(
      settingsService as unknown as SettingsService,
      configService as unknown as ConfigService,
      brokerSessionManager as unknown as BrokerSessionManager,
      brokerTokenRenewalScheduler as unknown as BrokerTokenRenewalScheduler,
      marketDataService as unknown as MarketDataService,
      instrumentMasterService as unknown as InstrumentMasterService,
      eventBus,
    );
  });

  describe('getCurrentMode', () => {
    it('falls back to the env default when no override has ever been persisted', () => {
      expect(service.getCurrentMode()).toBe('PAPER');
    });

    it('returns the persisted override once one exists, ignoring the env default', () => {
      settingsStore.set(TRADING_MODE_SETTING_KEY, 'LIVE');
      expect(service.getCurrentMode()).toBe('LIVE');
    });
  });

  describe('onModuleInit (bootstrap-once)', () => {
    it('persists the env default exactly once when nothing has ever been persisted', async () => {
      await service.onModuleInit();

      expect(settingsService.set).toHaveBeenCalledWith(
        TRADING_MODE_SETTING_KEY,
        'PAPER',
        'system:bootstrap',
      );
    });

    it('never overwrites an already-persisted override, even if the env default differs', async () => {
      settingsStore.set(TRADING_MODE_SETTING_KEY, 'LIVE');
      configService.tradingMode = 'PAPER';

      await service.onModuleInit();

      expect(settingsService.set).not.toHaveBeenCalled();
      expect(service.getCurrentMode()).toBe('LIVE');
    });
  });

  describe('onApplicationBootstrap', () => {
    it('initializes both providers for the current mode and never authenticates Dhan in PAPER', async () => {
      await service.onApplicationBootstrap();

      expect(marketDataService.initializeForMode).toHaveBeenCalledWith('PAPER');
      expect(instrumentMasterService.initializeForMode).toHaveBeenCalledWith(
        'PAPER',
      );
      expect(brokerSessionManager.bootstrapLiveSession).not.toHaveBeenCalled();
      expect(brokerTokenRenewalScheduler.start).not.toHaveBeenCalled();
    });

    it('authenticates completely and starts the renewal scheduler when restored mode is LIVE', async () => {
      settingsStore.set(TRADING_MODE_SETTING_KEY, 'LIVE');

      await service.onApplicationBootstrap();

      expect(brokerSessionManager.bootstrapLiveSession).toHaveBeenCalledTimes(
        1,
      );
      expect(brokerTokenRenewalScheduler.start).toHaveBeenCalledTimes(1);
    });

    it('never throws and still starts the renewal scheduler even if bootstrapLiveSession unexpectedly rejects (defense-in-depth on top of BrokerSessionManager already swallowing its own failures)', async () => {
      settingsStore.set(TRADING_MODE_SETTING_KEY, 'LIVE');
      brokerSessionManager.bootstrapLiveSession.mockRejectedValue(
        new Error('unexpected'),
      );

      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
      expect(brokerTokenRenewalScheduler.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('setMode', () => {
    it('switches to PAPER, tearing down the broker session and stopping the renewal scheduler', async () => {
      settingsStore.set(TRADING_MODE_SETTING_KEY, 'LIVE');
      await service.setMode('PAPER', 'user-1');

      expect(service.getCurrentMode()).toBe('PAPER');
      expect(brokerSessionManager.ensureSession).not.toHaveBeenCalled();
      expect(brokerSessionManager.unloadSession).toHaveBeenCalledTimes(1);
      expect(brokerTokenRenewalScheduler.stop).toHaveBeenCalledTimes(1);
      expect(marketDataService.prepareProviderForMode).toHaveBeenCalledWith(
        'PAPER',
      );
      expect(marketDataService.commitProviderSwitch).toHaveBeenCalledWith(
        'PAPER',
      );
    });

    it('is a no-op (never re-validates or re-publishes) when already in the requested mode', async () => {
      await service.setMode('PAPER', 'user-1');
      expect(publishSpy).not.toHaveBeenCalled();
      expect(settingsService.set).not.toHaveBeenCalled();
    });

    it('switches to LIVE only after confirming credentials exist and a broker session can be established, and starts the renewal scheduler', async () => {
      await service.setMode('LIVE', 'user-1');

      expect(brokerSessionManager.ensureSession).toHaveBeenCalledTimes(1);
      expect(service.getCurrentMode()).toBe('LIVE');
      expect(brokerTokenRenewalScheduler.start).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledWith(
        expect.any(TradingModeChangedEvent),
      );
    });

    it('refuses to switch to LIVE when no broker credentials are configured — never silently proceeds', async () => {
      configService.hasDhanCredentials = false;

      await expect(service.setMode('LIVE', 'user-1')).rejects.toThrow(
        BusinessException,
      );
      expect(brokerSessionManager.ensureSession).not.toHaveBeenCalled();
      expect(service.getCurrentMode()).toBe('PAPER');
      expect(settingsService.set).not.toHaveBeenCalled();
    });

    it('refuses to switch to LIVE when the broker session cannot be established — mode stays unchanged, no fallback', async () => {
      brokerSessionManager.ensureSession.mockRejectedValue(
        new Error('invalid credentials'),
      );

      await expect(service.setMode('LIVE', 'user-1')).rejects.toThrow(
        BusinessException,
      );
      expect(service.getCurrentMode()).toBe('PAPER');
      expect(settingsService.set).not.toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });

    it('allows switching to LIVE when ensureSession resolves but the session is not actually valid', async () => {
      brokerSessionManager.isSessionValid.mockReturnValue(false);

      const result = await service.setMode('LIVE', 'user-1');
      expect(result).toBe('LIVE');
      expect(service.getCurrentMode()).toBe('LIVE');
    });

    it('aborts the prepared market-data provider and leaves mode unchanged when the instrument-master prepare fails', async () => {
      instrumentMasterService.prepareRefreshForMode.mockRejectedValue(
        new Error('Dhan instrument download failed'),
      );

      await expect(service.setMode('LIVE', 'user-1')).rejects.toThrow(
        BusinessException,
      );

      expect(marketDataService.abortPreparedProvider).toHaveBeenCalledWith(
        'LIVE',
      );
      expect(marketDataService.commitProviderSwitch).not.toHaveBeenCalled();
      expect(settingsService.set).not.toHaveBeenCalled();
      expect(service.getCurrentMode()).toBe('PAPER');
    });

    it('never commits mode/cache/provider changes out of order — settings persist before instrument/market commits, which happen before the event publishes', async () => {
      const callOrder: string[] = [];
      settingsService.set.mockImplementation((key: string, value: unknown) => {
        settingsStore.set(key, value);
        callOrder.push('settings');
        return Promise.resolve({ key, value } as never);
      });
      instrumentMasterService.commitInstrumentSwitch.mockImplementation(() => {
        callOrder.push('instrument-commit');
        return Promise.resolve();
      });
      marketDataService.commitProviderSwitch.mockImplementation(() => {
        callOrder.push('market-data-commit');
        return Promise.resolve();
      });
      publishSpy.mockImplementation(() => {
        callOrder.push('event');
      });

      await service.setMode('LIVE', 'user-1');

      expect(callOrder).toEqual([
        'settings',
        'instrument-commit',
        'market-data-commit',
        'event',
      ]);
    });

    describe('single-flight / concurrency', () => {
      it('collapses concurrent identical-target calls into exactly one real switch', async () => {
        let resolveEnsureSession: (() => void) | undefined;
        brokerSessionManager.ensureSession.mockReturnValue(
          new Promise((resolve) => {
            resolveEnsureSession = () => resolve({} as never);
          }),
        );

        const calls = Array.from({ length: 25 }, () =>
          service.setMode('LIVE', 'user-1'),
        );
        resolveEnsureSession?.();
        const results = await Promise.all(calls);

        expect(results.every((mode) => mode === 'LIVE')).toBe(true);
        expect(brokerSessionManager.ensureSession).toHaveBeenCalledTimes(1);
        expect(settingsService.set).toHaveBeenCalledTimes(1);
      });

      it('serializes different-target concurrent calls rather than interleaving their prepare/commit phases', async () => {
        const first = service.setMode('LIVE', 'user-1');
        const second = service.setMode('PAPER', 'user-2');

        await Promise.all([first, second]);

        expect(service.getCurrentMode()).toBe('PAPER');
        expect(marketDataService.commitProviderSwitch).toHaveBeenNthCalledWith(
          1,
          'LIVE',
        );
        expect(marketDataService.commitProviderSwitch).toHaveBeenNthCalledWith(
          2,
          'PAPER',
        );
      });

      it('a failed switch does not block a subsequent differently-targeted switch from proceeding', async () => {
        configService.hasDhanCredentials = false;
        await expect(service.setMode('LIVE', 'user-1')).rejects.toThrow();

        configService.hasDhanCredentials = true;
        const result = await service.setMode('LIVE', 'user-1');

        expect(result).toBe('LIVE');
      });

      it('survives 200 sequential PAPER<->LIVE switches, ending in a consistent state', async () => {
        let mode: 'PAPER' | 'LIVE' = 'PAPER';
        for (let i = 0; i < 200; i += 1) {
          mode = mode === 'PAPER' ? 'LIVE' : 'PAPER';

          await service.setMode(mode, `user-${i}`);
          expect(service.getCurrentMode()).toBe(mode);
        }
        expect(marketDataService.commitProviderSwitch).toHaveBeenCalledTimes(
          200,
        );
      });
    });
  });
});
