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
    Pick<BrokerSessionManager, 'refresh' | 'getAllActiveAccountIds'>
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
      getAllActiveAccountIds: jest.fn().mockReturnValue(['acc-1']),
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

  it('reconnects market data, refreshes every active account session, and reloads the instrument cache, in order', async () => {
    await manager.recover('test reason');

    expect(marketDataService.stop).toHaveBeenCalled();
    expect(marketDataService.start).toHaveBeenCalled();
    expect(sessionManager.refresh).toHaveBeenCalledWith('acc-1');
    expect(instrumentMasterService.refresh).toHaveBeenCalled();
  });

  it('refreshes every active account independently — one account failing to refresh never blocks another or the rest of recovery', async () => {
    sessionManager.getAllActiveAccountIds.mockReturnValue(['acc-1', 'acc-2']);
    sessionManager.refresh.mockImplementation((accountId: string) =>
      accountId === 'acc-1'
        ? Promise.reject(new Error('refresh failed'))
        : Promise.resolve({} as Awaited<ReturnType<BrokerSessionManager['refresh']>>),
    );

    await manager.recover('test reason');

    expect(sessionManager.refresh).toHaveBeenCalledWith('acc-1');
    expect(sessionManager.refresh).toHaveBeenCalledWith('acc-2');
    expect(instrumentMasterService.refresh).toHaveBeenCalled();
  });

  it('does nothing session-related when there are no active accounts', async () => {
    sessionManager.getAllActiveAccountIds.mockReturnValue([]);

    await manager.recover('test reason');

    expect(sessionManager.refresh).not.toHaveBeenCalled();
    expect(instrumentMasterService.refresh).toHaveBeenCalled();
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
