import type { ConfigService } from '@core/config/config.service';
import type { TradingModeService } from '@modules/trading-mode/trading-mode.service';
import { BusinessException } from '@common/exceptions/business.exception';
import { AppConfigController } from './app-config.controller';

function buildController(options: {
  tradingMode: 'PAPER' | 'LIVE';
  defaultTradingMode?: 'PAPER' | 'LIVE';
}): {
  controller: AppConfigController;
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

  const controller = new AppConfigController(
    configService,
    tradingModeService as unknown as TradingModeService,
  );

  return { controller, tradingModeService };
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
});
