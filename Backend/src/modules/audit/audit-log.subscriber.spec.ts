import { AuditLogSubscriber } from './audit-log.subscriber';
import { AuditLogEntry } from './audit-log-entry.entity';
import type { IAuditLogRepository } from './interfaces/audit-log-repository.interface';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { DomainEvent } from '@core/event-bus/events/domain-event.base';

class TestEvent extends DomainEvent {
  readonly eventName = 'test.event';
}

describe('AuditLogSubscriber', () => {
  it('subscribes to every event on module init', () => {
    const eventBus: jest.Mocked<IEventBus> = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    const repository: jest.Mocked<IAuditLogRepository> = { record: jest.fn() };

    const subscriber = new AuditLogSubscriber(eventBus, repository);
    subscriber.onModuleInit();

    expect(eventBus.subscribeToAll).toHaveBeenCalledWith(expect.any(Function));
  });

  it('persists an AuditLogEntry built from the event when triggered', async () => {
    const eventBus: jest.Mocked<IEventBus> = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    const repository: jest.Mocked<IAuditLogRepository> = { record: jest.fn() };

    const subscriber = new AuditLogSubscriber(eventBus, repository);
    subscriber.onModuleInit();

    const handler = eventBus.subscribeToAll.mock.calls[0][0];
    const event = new TestEvent();

    await handler(event);

    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining(
        new AuditLogEntry(
          event.eventName,
          event.metadata.timestamp,
          event.metadata.correlationId,
          event,
        ),
      ),
    );
  });
});
