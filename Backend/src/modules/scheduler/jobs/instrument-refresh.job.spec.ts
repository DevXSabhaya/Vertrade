import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import { InstrumentRefreshJob } from './instrument-refresh.job';
import { InstrumentRefreshCompletedEvent } from '../events/instrument-refresh-completed.event';

describe('InstrumentRefreshJob', () => {
  it('refreshes the instrument master and publishes completion with the resulting count', async () => {
    const instrumentMasterService = {
      refresh: jest.fn().mockResolvedValue({
        version: 1,
        loadedAt: new Date(),
        instrumentCount: 42,
      }),
    };
    const publishSpy = jest.fn();
    const eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    } as unknown as IEventBus;

    const job = new InstrumentRefreshJob(
      instrumentMasterService as unknown as InstrumentMasterService,
      eventBus,
    );
    await job.run();

    expect(instrumentMasterService.refresh).toHaveBeenCalled();
    const event = publishSpy.mock.calls
      .map(([e]: [unknown]) => e)
      .find((e) => e instanceof InstrumentRefreshCompletedEvent);
    expect(event?.instrumentCount).toBe(42);
  });
});
