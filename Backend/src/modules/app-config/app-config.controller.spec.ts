import type { ConfigService } from '@core/config/config.service';
import { AppConfigController } from './app-config.controller';

describe('AppConfigController', () => {
  it('reports the current trading mode from ConfigService', () => {
    const configService = { tradingMode: 'PAPER' } as unknown as ConfigService;
    const controller = new AppConfigController(configService);
    expect(controller.getTradingMode()).toEqual({ tradingMode: 'PAPER' });
  });

  it('reports LIVE when TRADING_MODE=LIVE', () => {
    const configService = { tradingMode: 'LIVE' } as unknown as ConfigService;
    const controller = new AppConfigController(configService);
    expect(controller.getTradingMode()).toEqual({ tradingMode: 'LIVE' });
  });
});
