import type { ConfigService } from '@core/config/config.service';
import type { TradingModeService } from '@modules/trading-mode/trading-mode.service';
import type { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import type { BrokerHealthService } from '@modules/broker-health/broker-health.service';
import { HealthStatus } from '@modules/broker-health/models/health-status.enum';
import type { DhanAccountService } from '@modules/broker/broker-auth/dhan-account.service';
import type { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import { BusinessException } from '@common/exceptions/business.exception';
import { AppConfigController } from './app-config.controller';

function buildController(options: {
  tradingMode: 'PAPER' | 'LIVE';
  defaultTradingMode?: 'PAPER' | 'LIVE';
  isSessionValid?: boolean;
  clientCode?: string | null;
  tokenExpiresAt?: string;
  lastRefreshedAt?: Date | null;
  authState?: 'AUTHENTICATED' | 'DISCONNECTED' | 'REAUTH_REQUIRED';
  authStatus?: HealthStatus;
  marketDataStatus?: HealthStatus;
  restApiStatus?: HealthStatus;
  websocketStatus?: HealthStatus;
  connectedSince?: string | null;
  timestamp?: string;
  instrumentCount?: number;
  fundsSummary?: {
    availableBalance: number | null;
    usedMargin: number | null;
    availableMargin: number | null;
    todaysRealizedPnl: number | null;
    unrealizedPnl: number | null;
  };
}): {
  controller: AppConfigController;
  brokerSessionManager: jest.Mocked<
    Pick<
      BrokerSessionManager,
      | 'isSessionValid'
      | 'getActiveSession'
      | 'ensureSession'
      | 'logout'
      | 'reconnectWithToken'
      | 'getLastRefreshedAt'
      | 'getAuthState'
    >
  >;
  dhanAccountService: jest.Mocked<Pick<DhanAccountService, 'getFundsSummary'>>;
  tradingModeService: { getCurrentMode: jest.Mock; setMode: jest.Mock };
} {
  const configService = {
    tradingMode: options.defaultTradingMode ?? options.tradingMode,
  } as unknown as ConfigService;
  let currentMode = options.tradingMode;
  const tradingModeService = {
    getCurrentMode: jest.fn(() => currentMode),
    setMode: jest.fn((mode: 'PAPER' | 'LIVE') => {
      currentMode = mode;
      return Promise.resolve(mode);
    }),
  };
  const session =
    options.clientCode !== undefined && options.clientCode !== null
      ? {
          clientCode: options.clientCode,
          expiresAt: new Date(
            options.tokenExpiresAt ?? '2026-01-02T00:00:00.000Z',
          ),
        }
      : null;
  const brokerSessionManager = {
    isSessionValid: jest.fn().mockReturnValue(options.isSessionValid ?? false),
    getActiveSession: jest.fn().mockReturnValue(session),
    ensureSession: jest.fn().mockResolvedValue(session),
    logout: jest.fn().mockResolvedValue(undefined),
    reconnectWithToken: jest.fn().mockResolvedValue(session),
    getLastRefreshedAt: jest
      .fn()
      .mockReturnValue(options.lastRefreshedAt ?? null),
    getAuthState: jest
      .fn()
      .mockReturnValue(options.authState ?? 'DISCONNECTED'),
  };
  const brokerHealthService = {
    getSnapshot: jest.fn().mockReturnValue({
      authStatus: options.authStatus ?? HealthStatus.UNKNOWN,
      marketDataStatus: options.marketDataStatus ?? HealthStatus.UNKNOWN,
      restApiStatus: options.restApiStatus ?? HealthStatus.UNKNOWN,
      websocketStatus: options.websocketStatus ?? HealthStatus.UNKNOWN,
      connectedSince: options.connectedSince ?? null,
      timestamp: options.timestamp ?? '2026-01-01T00:00:00.000Z',
    }),
  } as unknown as BrokerHealthService;
  const dhanAccountService = {
    getFundsSummary: jest.fn().mockResolvedValue(
      options.fundsSummary ?? {
        availableBalance: null,
        usedMargin: null,
        availableMargin: null,
        todaysRealizedPnl: null,
        unrealizedPnl: null,
      },
    ),
  };
  const instrumentMasterService = {
    getSnapshot: jest.fn().mockReturnValue({
      version: 1,
      loadedAt: new Date('2026-01-01T00:00:00.000Z'),
      instrumentCount: options.instrumentCount ?? 0,
    }),
  };

  const controller = new AppConfigController(
    configService,
    tradingModeService as unknown as TradingModeService,
    brokerSessionManager as unknown as BrokerSessionManager,
    brokerHealthService,
    dhanAccountService as unknown as DhanAccountService,
    instrumentMasterService as unknown as InstrumentMasterService,
  );

  return {
    controller,
    brokerSessionManager,
    dhanAccountService,
    tradingModeService,
  };
}

describe('AppConfigController', () => {
  describe('getTradingMode', () => {
    it('reports the current trading mode from TradingModeService', () => {
      const { controller } = buildController({
        tradingMode: 'PAPER',
        defaultTradingMode: 'PAPER',
      });
      expect(controller.getTradingMode()).toEqual({
        tradingMode: 'PAPER',
        defaultTradingMode: 'PAPER',
      });
    });

    it('reports LIVE as the current mode independently of the env default', () => {
      const { controller } = buildController({
        tradingMode: 'LIVE',
        defaultTradingMode: 'PAPER',
      });
      expect(controller.getTradingMode()).toEqual({
        tradingMode: 'LIVE',
        defaultTradingMode: 'PAPER',
      });
    });
  });

  describe('setTradingMode', () => {
    const user = { userId: 'u1', email: 'trader@example.com' };

    it('delegates to TradingModeService.setMode with the caller identity and returns the new mode', async () => {
      const { controller, tradingModeService } = buildController({
        tradingMode: 'PAPER',
      });

      const result = await controller.setTradingMode(user, { mode: 'LIVE' });

      expect(tradingModeService.setMode).toHaveBeenCalledWith(
        'LIVE',
        'trader@example.com',
      );
      expect(result.tradingMode).toBe('LIVE');
    });

    it('propagates a rejection from TradingModeService.setMode without switching (no silent fallback)', async () => {
      const { controller, tradingModeService } = buildController({
        tradingMode: 'PAPER',
      });
      tradingModeService.setMode.mockRejectedValueOnce(
        new BusinessException('Cannot switch to LIVE mode: no credentials.'),
      );

      await expect(
        controller.setTradingMode(user, { mode: 'LIVE' }),
      ).rejects.toThrow(BusinessException);
      expect(controller.getTradingMode().tradingMode).toBe('PAPER');
    });
  });

  describe('getBrokerStatus', () => {
    it('reports a constant, never-connected status in PAPER mode without ever consulting the broker session', () => {
      const { controller } = buildController({ tradingMode: 'PAPER' });
      expect(controller.getBrokerStatus()).toEqual({
        tradingMode: 'PAPER',
        brokerName: 'dhan',
        connected: false,
        authStatus: HealthStatus.UNKNOWN,
        clientCode: null,
        marketDataCapability: HealthStatus.UNKNOWN,
        orderExecutionCapability: HealthStatus.UNKNOWN,
        lastSuccessfulConnectionAt: null,
        lastHealthCheckAt: null,
        tokenExpiresAt: null,
        lastRefreshedAt: null,
        instrumentMasterStatus: HealthStatus.UNKNOWN,
        websocketStatus: HealthStatus.UNKNOWN,
        authState: 'DISCONNECTED',
      });
    });

    it('reports the real broker session/health state in LIVE mode when connected', () => {
      const { controller } = buildController({
        tradingMode: 'LIVE',
        isSessionValid: true,
        clientCode: 'ABC123',
        tokenExpiresAt: '2026-01-02T00:00:00.000Z',
        lastRefreshedAt: new Date('2026-01-01T08:55:00.000Z'),
        authState: 'AUTHENTICATED',
        authStatus: HealthStatus.HEALTHY,
        marketDataStatus: HealthStatus.HEALTHY,
        restApiStatus: HealthStatus.HEALTHY,
        websocketStatus: HealthStatus.HEALTHY,
        connectedSince: '2026-01-01T09:00:00.000Z',
        timestamp: '2026-01-01T09:05:00.000Z',
        instrumentCount: 500,
      });
      expect(controller.getBrokerStatus()).toEqual({
        tradingMode: 'LIVE',
        brokerName: 'dhan',
        connected: true,
        authStatus: HealthStatus.HEALTHY,
        clientCode: 'ABC123',
        marketDataCapability: HealthStatus.HEALTHY,
        orderExecutionCapability: HealthStatus.HEALTHY,
        lastSuccessfulConnectionAt: '2026-01-01T09:00:00.000Z',
        lastHealthCheckAt: '2026-01-01T09:05:00.000Z',
        tokenExpiresAt: '2026-01-02T00:00:00.000Z',
        lastRefreshedAt: '2026-01-01T08:55:00.000Z',
        instrumentMasterStatus: HealthStatus.HEALTHY,
        websocketStatus: HealthStatus.HEALTHY,
        authState: 'AUTHENTICATED',
      });
    });

    it('reports disconnected in LIVE mode with no active session', () => {
      const { controller } = buildController({
        tradingMode: 'LIVE',
        isSessionValid: false,
        clientCode: null,
        authStatus: HealthStatus.DISCONNECTED,
      });
      expect(controller.getBrokerStatus()).toEqual(
        expect.objectContaining({
          tradingMode: 'LIVE',
          connected: false,
          authStatus: HealthStatus.DISCONNECTED,
          clientCode: null,
        }),
      );
    });
  });

  describe('connectBroker', () => {
    it('rejects in PAPER mode without ever touching the broker session', async () => {
      const { controller, brokerSessionManager } = buildController({
        tradingMode: 'PAPER',
      });
      await expect(controller.connectBroker()).rejects.toThrow(
        BusinessException,
      );
      expect(brokerSessionManager.ensureSession).not.toHaveBeenCalled();
    });

    it('calls ensureSession() in LIVE mode and returns the refreshed status', async () => {
      const { controller, brokerSessionManager } = buildController({
        tradingMode: 'LIVE',
        isSessionValid: true,
        clientCode: 'ABC123',
      });

      const result = await controller.connectBroker();

      expect(brokerSessionManager.ensureSession).toHaveBeenCalledTimes(1);
      expect(result.connected).toBe(true);
      expect(result.clientCode).toBe('ABC123');
    });
  });

  describe('disconnectBroker', () => {
    it('rejects in PAPER mode without ever touching the broker session', async () => {
      const { controller, brokerSessionManager } = buildController({
        tradingMode: 'PAPER',
      });
      await expect(controller.disconnectBroker()).rejects.toThrow(
        BusinessException,
      );
      expect(brokerSessionManager.logout).not.toHaveBeenCalled();
    });

    it('calls logout() in LIVE mode', async () => {
      const { controller, brokerSessionManager } = buildController({
        tradingMode: 'LIVE',
      });

      await controller.disconnectBroker();

      expect(brokerSessionManager.logout).toHaveBeenCalledTimes(1);
    });
  });

  describe('reconnectBroker', () => {
    it('calls reconnectWithToken with the supplied token and returns the refreshed status, regardless of trading mode', async () => {
      const { controller, brokerSessionManager } = buildController({
        tradingMode: 'PAPER',
      });

      await controller.reconnectBroker({ accessToken: 'fresh-token' });

      expect(brokerSessionManager.reconnectWithToken).toHaveBeenCalledWith(
        'fresh-token',
      );
    });

    it('propagates a rejection from reconnectWithToken (e.g. an invalid pasted token) without swallowing it', async () => {
      const { controller, brokerSessionManager } = buildController({
        tradingMode: 'LIVE',
      });
      brokerSessionManager.reconnectWithToken.mockRejectedValue(
        new Error('Dhan rejected the token'),
      );

      await expect(
        controller.reconnectBroker({ accessToken: 'bad-token' }),
      ).rejects.toThrow('Dhan rejected the token');
    });
  });

  describe('getBrokerAccountSummary', () => {
    it('reports unsupported in PAPER mode without ever calling the broker API', async () => {
      const { controller, dhanAccountService } = buildController({
        tradingMode: 'PAPER',
      });

      const result = await controller.getBrokerAccountSummary();

      expect(result.supported).toBe(false);
      expect(result.reason).toMatch(/paper trading/i);
      expect(result.availableBalance).toBeNull();
      expect(dhanAccountService.getFundsSummary).not.toHaveBeenCalled();
    });

    it('reports unsupported in LIVE mode with no active session, without calling the broker API', async () => {
      const { controller, dhanAccountService } = buildController({
        tradingMode: 'LIVE',
        isSessionValid: false,
        clientCode: null,
      });

      const result = await controller.getBrokerAccountSummary();

      expect(result.supported).toBe(false);
      expect(result.reason).toMatch(/connect the broker/i);
      expect(dhanAccountService.getFundsSummary).not.toHaveBeenCalled();
    });

    it('returns the real funds summary in LIVE mode with a valid session', async () => {
      const { controller } = buildController({
        tradingMode: 'LIVE',
        isSessionValid: true,
        clientCode: 'ABC123',
        fundsSummary: {
          availableBalance: 45000.5,
          usedMargin: 2000,
          availableMargin: 48000,
          todaysRealizedPnl: 1200.75,
          unrealizedPnl: -300.25,
        },
      });

      const result = await controller.getBrokerAccountSummary();

      expect(result).toEqual({
        supported: true,
        reason: null,
        availableBalance: 45000.5,
        usedMargin: 2000,
        availableMargin: 48000,
        todaysRealizedPnl: 1200.75,
        unrealizedPnl: -300.25,
      });
    });
  });
});
