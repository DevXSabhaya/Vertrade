import { BrokerTokenRenewalScheduler } from './broker-token-renewal.scheduler';
import type { BrokerSessionManager } from './broker-session-manager';
import type { ConfigService } from '@core/config/config.service';
import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';

describe('BrokerTokenRenewalScheduler', () => {
  let sessionManager: jest.Mocked<
    Pick<BrokerSessionManager, 'getActiveSession' | 'refresh'>
  >;
  let scheduler: jest.Mocked<ITimerScheduler>;
  let tickCallback: (() => void) | undefined;
  let renewal: BrokerTokenRenewalScheduler;

  beforeEach(() => {
    sessionManager = {
      getActiveSession: jest.fn().mockReturnValue({}),
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

  it('calls sessionManager.refresh() on each tick when a session exists', async () => {
    renewal.start();
    tickCallback?.();
    await Promise.resolve();

    expect(sessionManager.refresh).toHaveBeenCalledTimes(1);
  });

  it('skips renewal on a tick when no session exists', async () => {
    sessionManager.getActiveSession.mockReturnValue(null);
    renewal.start();
    tickCallback?.();
    await Promise.resolve();

    expect(sessionManager.refresh).not.toHaveBeenCalled();
  });

  it('never throws out of the tick even when refresh() rejects', async () => {
    sessionManager.refresh.mockRejectedValue(new Error('renewal failed'));
    renewal.start();

    expect(() => tickCallback?.()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
