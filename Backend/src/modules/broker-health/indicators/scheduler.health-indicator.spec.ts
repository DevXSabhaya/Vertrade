import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { SchedulerHealthIndicator } from './scheduler.health-indicator';
import { HealthStatus } from '../models/health-status.enum';
import { FakeClock } from '../testing/fake-clock';

describe('SchedulerHealthIndicator', () => {
  it('reports UNKNOWN before observing a scheduler.started event', async () => {
    const eventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    } as unknown as IEventBus;
    const indicator = new SchedulerHealthIndicator(eventBus, new FakeClock());
    indicator.onModuleInit();

    expect((await indicator.check()).status).toBe(HealthStatus.UNKNOWN);
  });

  it('reports HEALTHY purely from observing scheduler.started on the Event Bus (no direct SchedulerModule dependency)', async () => {
    const handlers = new Map<string, (event: unknown) => void>();
    const eventBus = {
      publish: jest.fn(),
      subscribe: jest.fn((name: string, handler: (event: unknown) => void) =>
        handlers.set(name, handler),
      ),
      subscribeToAll: jest.fn(),
    } as unknown as IEventBus;
    const indicator = new SchedulerHealthIndicator(eventBus, new FakeClock());
    indicator.onModuleInit();

    handlers.get(SchedulerHealthIndicator.STARTED_EVENT_NAME)?.({});

    expect((await indicator.check()).status).toBe(HealthStatus.HEALTHY);
  });

  it('reverts to UNKNOWN after observing scheduler.stopped', async () => {
    const handlers = new Map<string, (event: unknown) => void>();
    const eventBus = {
      publish: jest.fn(),
      subscribe: jest.fn((name: string, handler: (event: unknown) => void) =>
        handlers.set(name, handler),
      ),
      subscribeToAll: jest.fn(),
    } as unknown as IEventBus;
    const indicator = new SchedulerHealthIndicator(eventBus, new FakeClock());
    indicator.onModuleInit();

    handlers.get(SchedulerHealthIndicator.STARTED_EVENT_NAME)?.({});
    handlers.get(SchedulerHealthIndicator.STOPPED_EVENT_NAME)?.({});

    expect((await indicator.check()).status).toBe(HealthStatus.UNKNOWN);
  });
});
