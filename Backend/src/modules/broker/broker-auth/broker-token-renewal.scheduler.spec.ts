import { BrokerTokenRenewalScheduler } from './broker-token-renewal.scheduler';
import type { BrokerSessionManager } from './broker-session-manager';
import type { ConfigService } from '@core/config/config.service';
import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';

describe('BrokerTokenRenewalScheduler', () => {
  let sessionManager: jest.Mocked<
    Pick<BrokerSessionManager, 'getAllActiveAccountIds' | 'refresh'>
  >;
  let scheduler: jest.Mocked<ITimerScheduler>;
  let tickCallback: (() => void) | undefined;
  let renewal: BrokerTokenRenewalScheduler;

  beforeEach(() => {
    sessionManager = {
      getAllActiveAccountIds: jest.fn().mockReturnValue(['acc-1']),
      refresh: jest.fn().mockResolvedValue({}),
    };
    tickCallback = undefined;
    scheduler = {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- second param required to match ITimerScheduler.setInterval's signature
      setInterval: jest.fn((cb: () => void, _intervalMs: number) => {
        tickCallback = cb;
        return 'handle-1';
      }),
      clearInterval: jest.fn(),
      setTimeout: jest.fn(),
      clearTimeout: jest.fn(),
    };
    renewal = new BrokerTokenRenewalScheduler(
      sessionManager as unknown as BrokerSessionManager,
      { brokerTokenRenewalIntervalMs: 1000 } as ConfigService,
      scheduler,
    );
  });

  it('is not running until start() is called', () => {
    expect(renewal.isRunning()).toBe(false);
  });

  it('starts a single interval and is idempotent against repeated start() calls', () => {
    renewal.start();
    renewal.start();

    expect(scheduler.setInterval).toHaveBeenCalledTimes(1);
    expect(renewal.isRunning()).toBe(true);
  });

  it('stops the interval and is idempotent against repeated stop() calls', () => {
    renewal.start();
    renewal.stop();
    renewal.stop();

    expect(scheduler.clearInterval).toHaveBeenCalledTimes(1);
    expect(renewal.isRunning()).toBe(false);
  });

  it('calls sessionManager.refresh() for each active account on each tick', async () => {
    renewal.start();
    tickCallback?.();
    await Promise.resolve();

    expect(sessionManager.refresh).toHaveBeenCalledTimes(1);
    expect(sessionManager.refresh).toHaveBeenCalledWith('acc-1');
  });

  it('refreshes every active account independently on each tick', async () => {
    sessionManager.getAllActiveAccountIds.mockReturnValue(['acc-1', 'acc-2']);
    renewal.start();
    tickCallback?.();
    await Promise.resolve();

    expect(sessionManager.refresh).toHaveBeenCalledTimes(2);
    expect(sessionManager.refresh).toHaveBeenCalledWith('acc-1');
    expect(sessionManager.refresh).toHaveBeenCalledWith('acc-2');
  });

  it('skips renewal on a tick when no accounts are active', async () => {
    sessionManager.getAllActiveAccountIds.mockReturnValue([]);
    renewal.start();
    tickCallback?.();
    await Promise.resolve();

    expect(sessionManager.refresh).not.toHaveBeenCalled();
  });

  it('never throws out of the tick even when refresh() rejects for one account', async () => {
    sessionManager.getAllActiveAccountIds.mockReturnValue(['acc-1', 'acc-2']);
    sessionManager.refresh.mockRejectedValueOnce(new Error('renewal failed'));
    sessionManager.refresh.mockResolvedValueOnce({} as never);
    renewal.start();

    expect(() => tickCallback?.()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
});
