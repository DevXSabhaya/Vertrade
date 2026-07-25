import type { MarketDataService } from '@modules/market-data/market-data.service';
import type { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import type { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import type { IRecoveryHistoryRepository } from '../interfaces/recovery-history-repository.interface';
import { BrokerHealthMetricsService } from '../metrics/broker-health-metrics.service';
import { RecoveryManagerService } from './recovery-manager.service';
import { FakeClock } from '../testing/fake-clock';

describe('RecoveryManagerService', () => {
  let marketDataService: jest.Mocked<Pick<MarketDataService, 'start' | 'stop'>>;
  let sessionManager: jest.Mocked<
    Pick<BrokerSessionManager, 'refresh' | 'login'>
  >;
  let instrumentMasterService: jest.Mocked<
    Pick<InstrumentMasterService, 'refresh'>
  >;
  let repository: jest.Mocked<IRecoveryHistoryRepository>;
  let metrics: BrokerHealthMetricsService;
  let manager: RecoveryManagerService;

  beforeEach(() => {
    marketDataService = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    };
    sessionManager = {
      refresh: jest.fn().mockResolvedValue(undefined),
      login: jest.fn().mockResolvedValue(undefined),
    };
    instrumentMasterService = {
      refresh: jest.fn().mockResolvedValue(undefined),
    };
    repository = {
      save: jest.fn().mockResolvedValue(undefined),
      findRecent: jest.fn(),
    };
    metrics = new BrokerHealthMetricsService();
    manager = new RecoveryManagerService(
      marketDataService as unknown as MarketDataService,
      sessionManager as unknown as BrokerSessionManager,
      instrumentMasterService as unknown as InstrumentMasterService,
      metrics,
      repository,
      new FakeClock(),
    );
  });

  it('reconnects market data, refreshes the session, and reloads the instrument cache, in order', async () => {
    await manager.recover('test reason');

    expect(marketDataService.stop).toHaveBeenCalled();
    expect(marketDataService.start).toHaveBeenCalled();
    expect(sessionManager.refresh).toHaveBeenCalled();
    expect(instrumentMasterService.refresh).toHaveBeenCalled();
  });

  it('falls back to login() when refresh() fails', async () => {
    sessionManager.refresh.mockRejectedValueOnce(new Error('refresh failed'));

    await manager.recover('test reason');

    expect(sessionManager.login).toHaveBeenCalled();
  });

  it('records a successful attempt in recovery history', async () => {
    await manager.recover('test reason');

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'test reason',
        succeeded: true,
        error: null,
      }),
    );
  });

  it('records a failed attempt and rethrows when a step fails unrecoverably', async () => {
    instrumentMasterService.refresh.mockRejectedValueOnce(
      new Error('cache reload failed'),
    );

    await expect(manager.recover('test reason')).rejects.toThrow(
      'cache reload failed',
    );

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        succeeded: false,
        error: 'cache reload failed',
      }),
    );
  });
});
