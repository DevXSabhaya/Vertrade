import type { TradingModeService } from '@modules/trading-mode/trading-mode.service';
import type { AuthenticatedUser } from '@modules/auth/models/authenticated-user.model';
import { BusinessException } from '@common/exceptions/business.exception';
import { AppConfigController } from './app-config.controller';

function buildController(options: {
  tradingMode: 'PAPER' | 'LIVE';
  selectedBrokerAccountId?: string | null;
}): {
  controller: AppConfigController;
  tradingModeService: {
    getPreference: jest.Mock;
    setMode: jest.Mock;
    setSelectedBroker: jest.Mock;
  };
} {
  let current = {
    tradingMode: options.tradingMode,
    selectedBrokerAccountId: options.selectedBrokerAccountId ?? null,
  };
  const tradingModeService = {
    getPreference: jest.fn(() =>
      Promise.resolve({
        userId: 'u1',
        ...current,
        updatedAt: new Date(),
      }),
    ),
    setMode: jest.fn(
      (
        _userId: string,
        mode: 'PAPER' | 'LIVE',
        _changedBy: string,
        brokerAccountId?: string,
      ) => {
        current = {
          tradingMode: mode,
          selectedBrokerAccountId:
            mode === 'LIVE' ? (brokerAccountId ?? null) : null,
        };
        return Promise.resolve(mode);
      },
    ),
    setSelectedBroker: jest.fn(),
  };

  const controller = new AppConfigController(
    tradingModeService as unknown as TradingModeService,
  );

  return { controller, tradingModeService };
}

describe('AppConfigController', () => {
  const user: AuthenticatedUser = {
    userId: 'u1',
    email: 'trader@example.com',
  };

  describe('getTradingMode', () => {
    it('reports the current trading mode from TradingModeService', async () => {
      const { controller } = buildController({ tradingMode: 'PAPER' });
      await expect(controller.getTradingMode(user)).resolves.toEqual({
        tradingMode: 'PAPER',
        selectedBrokerAccountId: null,
      });
    });

    it('reports LIVE as the current mode independently of the env default', async () => {
      const { controller } = buildController({
        tradingMode: 'LIVE',
        selectedBrokerAccountId: 'acc-1',
      });
      await expect(controller.getTradingMode(user)).resolves.toEqual({
        tradingMode: 'LIVE',
        selectedBrokerAccountId: 'acc-1',
      });
    });
  });

  describe('setTradingMode', () => {
    it('delegates to TradingModeService.setMode with the caller identity and returns the new mode', async () => {
      const { controller, tradingModeService } = buildController({
        tradingMode: 'PAPER',
      });

      const result = await controller.setTradingMode(user, {
        mode: 'LIVE',
        brokerAccountId: 'acc-1',
      });

      expect(tradingModeService.setMode).toHaveBeenCalledWith(
        'u1',
        'LIVE',
        'trader@example.com',
        'acc-1',
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
        controller.setTradingMode(user, {
          mode: 'LIVE',
          brokerAccountId: 'acc-1',
        }),
      ).rejects.toThrow(BusinessException);
      await expect(controller.getTradingMode(user)).resolves.toEqual(
        expect.objectContaining({ tradingMode: 'PAPER' }),
      );
    });
  });
});
