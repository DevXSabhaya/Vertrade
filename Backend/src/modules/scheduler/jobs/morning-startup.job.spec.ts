import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import type { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import type { MarketDataService } from '@modules/market-data/market-data.service';
import { MorningStartupJob } from './morning-startup.job';
import { MorningStartupCompletedEvent } from '../events/morning-startup-completed.event';

describe('MorningStartupJob', () => {
  it('logs in, refreshes instruments, starts market data, and publishes completion with verification results', async () => {
    const sessionManager = {
      ensureSession: jest.fn().mockResolvedValue(undefined),
      isSessionValid: jest.fn().mockReturnValue(true),
    };
    const instrumentMasterService = {
      refresh: jest.fn().mockResolvedValue(undefined),
    };
    const marketDataService = {
      start: jest.fn().mockResolvedValue(undefined),
      getHealth: jest.fn().mockReturnValue({ connected: true }),
    };
    const publishSpy = jest.fn();
    const eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    } as unknown as IEventBus;

    const job = new MorningStartupJob(
      sessionManager as unknown as BrokerSessionManager,
      instrumentMasterService as unknown as InstrumentMasterService,
      marketDataService as unknown as MarketDataService,
      eventBus,
    );

    await job.run();

    expect(sessionManager.ensureSession).toHaveBeenCalled();
    expect(instrumentMasterService.refresh).toHaveBeenCalled();
    expect(marketDataService.start).toHaveBeenCalled();

    const event = publishSpy.mock.calls
      .map(([e]: [unknown]) => e)
      .find((e) => e instanceof MorningStartupCompletedEvent);
    expect(event?.restVerified).toBe(true);
    expect(event?.websocketVerified).toBe(true);
  });

  it('reports verification failures without throwing when REST/WS are not actually up', async () => {
    const sessionManager = {
      ensureSession: jest.fn().mockResolvedValue(undefined),
      isSessionValid: jest.fn().mockReturnValue(false),
    };
    const instrumentMasterService = {
      refresh: jest.fn().mockResolvedValue(undefined),
    };
    const marketDataService = {
      start: jest.fn().mockResolvedValue(undefined),
      getHealth: jest.fn().mockReturnValue({ connected: false }),
    };
    const publishSpy = jest.fn();
    const eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    } as unknown as IEventBus;

    const job = new MorningStartupJob(
      sessionManager as unknown as BrokerSessionManager,
      instrumentMasterService as unknown as InstrumentMasterService,
      marketDataService as unknown as MarketDataService,
      eventBus,
    );

    await expect(job.run()).resolves.toBeUndefined();
    const event = publishSpy.mock.calls
      .map(([e]: [unknown]) => e)
      .find((e) => e instanceof MorningStartupCompletedEvent);
    expect(event?.restVerified).toBe(false);
    expect(event?.websocketVerified).toBe(false);
  });
});
