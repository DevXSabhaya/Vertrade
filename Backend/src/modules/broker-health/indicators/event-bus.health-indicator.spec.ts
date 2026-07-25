import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEmitterEventBus } from '@core/event-bus/event-emitter-event-bus';
import { EventBusHealthIndicator } from './event-bus.health-indicator';
import { HealthStatus } from '../models/health-status.enum';
import { FakeClock } from '../testing/fake-clock';

describe('EventBusHealthIndicator', () => {
  it('reports HEALTHY when the round-trip probe is observed', async () => {
    const eventBus = new EventEmitterEventBus(new EventEmitter2());
    const indicator = new EventBusHealthIndicator(eventBus, new FakeClock());
    indicator.onModuleInit();

    const result = await indicator.check();

    expect(result.status).toBe(HealthStatus.HEALTHY);
  });

  it('reports DEGRADED when no subscriber ever observes the probe', async () => {
    const silentEventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    const indicator = new EventBusHealthIndicator(
      silentEventBus,
      new FakeClock(),
    );
    // Deliberately skip onModuleInit(): no subscriber registered.

    const result = await indicator.check();

    expect(result.status).toBe(HealthStatus.DEGRADED);
  });
});
