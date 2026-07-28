import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { ConfigService } from '@core/config/config.service';
import type { SettingsService } from '@modules/settings/settings.service';
import type { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
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
    hasAngelOneCredentials: boolean;
  };
  let brokerSessionManager: jest.Mocked<
    Pick<BrokerSessionManager, 'ensureSession' | 'isSessionValid'>
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
    configService = { tradingMode: 'PAPER', hasAngelOneCredentials: true };
    brokerSessionManager = {
      ensureSession: jest.fn().mockResolvedValue({}),
      isSessionValid: jest.fn().mockReturnValue(true),
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

  describe('setMode', () => {
    it('switches to PAPER without any broker safety checks', async () => {
      settingsStore.set(TRADING_MODE_SETTING_KEY, 'LIVE');
      await service.setMode('PAPER', 'user-1');

      expect(service.getCurrentMode()).toBe('PAPER');
      expect(brokerSessionManager.ensureSession).not.toHaveBeenCalled();
    });

    it('is a no-op (never re-validates or re-publishes) when already in the requested mode', async () => {
      await service.setMode('PAPER', 'user-1');
      expect(publishSpy).not.toHaveBeenCalled();
      expect(settingsService.set).not.toHaveBeenCalled();
    });

    it('switches to LIVE only after confirming credentials exist and a broker session can be established', async () => {
      await service.setMode('LIVE', 'user-1');

      expect(brokerSessionManager.ensureSession).toHaveBeenCalledTimes(1);
      expect(service.getCurrentMode()).toBe('LIVE');
      expect(publishSpy).toHaveBeenCalledWith(
        expect.any(TradingModeChangedEvent),
      );
    });

    it('refuses to switch to LIVE when no broker credentials are configured — never silently proceeds', async () => {
      configService.hasAngelOneCredentials = false;

      await expect(service.setMode('LIVE', 'user-1')).rejects.toThrow(
        BusinessException,
      );
      expect(brokerSessionManager.ensureSession).not.toHaveBeenCalled();
      expect(service.getCurrentMode()).toBe('PAPER');
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

    it('refuses to switch to LIVE when ensureSession resolves but the session is not actually valid', async () => {
      brokerSessionManager.isSessionValid.mockReturnValue(false);

      await expect(service.setMode('LIVE', 'user-1')).rejects.toThrow(
        BusinessException,
      );
      expect(service.getCurrentMode()).toBe('PAPER');
    });
  });
});
