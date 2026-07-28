import { ApplicationLogSubscriber } from './application-log.subscriber';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import { LoggerService } from '@core/logger/logger.service';

class TestEvent extends DomainEvent {
  readonly eventName = 'test.event';
}

describe('ApplicationLogSubscriber', () => {
  it('subscribes to every event on module init', () => {
    const eventBus: jest.Mocked<IEventBus> = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    const logger = new LoggerService();
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);

    const subscriber = new ApplicationLogSubscriber(eventBus, logger);
    subscriber.onModuleInit();

    expect(eventBus.subscribeToAll).toHaveBeenCalledWith(expect.any(Function));
  });

  it('logs the event name and metadata through LoggerService when triggered', () => {
    const eventBus: jest.Mocked<IEventBus> = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    const logger = new LoggerService();
    const logSpy = jest
      .spyOn(logger, 'log')
      .mockImplementation(() => undefined);

    const subscriber = new ApplicationLogSubscriber(eventBus, logger);
    subscriber.onModuleInit();

    const handler = eventBus.subscribeToAll.mock.calls[0][0];
    const event = new TestEvent();
    void handler(event);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"eventName":"test.event"'),
      'ApplicationLog',
    );
  });
});
