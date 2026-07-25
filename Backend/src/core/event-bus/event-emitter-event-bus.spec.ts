import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEmitterEventBus } from './event-emitter-event-bus';
import { DomainEvent } from './events/domain-event.base';

class TestEvent extends DomainEvent {
  readonly eventName = 'test.event';
  constructor(public readonly payload: string) {
    super();
  }
}

describe('EventEmitterEventBus', () => {
  let bus: EventEmitterEventBus;

  beforeEach(() => {
    bus = new EventEmitterEventBus(
      new EventEmitter2({ wildcard: true, delimiter: '.' }),
    );
  });

  it('delivers a published event to a subscriber of the same event name', () => {
    const handler = jest.fn();
    bus.subscribe<TestEvent>('test.event', handler);

    const event = new TestEvent('hello');
    bus.publish(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('does not deliver events to subscribers of a different event name', () => {
    const handler = jest.fn();
    bus.subscribe('other.event', handler);

    bus.publish(new TestEvent('hello'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('delivers every published event to a subscribeToAll handler', () => {
    const handler = jest.fn();
    bus.subscribeToAll(handler);

    const event = new TestEvent('hello');
    bus.publish(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('carries eventName, timestamp, version, and category on the event metadata', () => {
    const event = new TestEvent('hello');

    expect(event.eventName).toBe('test.event');
    expect(event.metadata.version).toBe(1);
    expect(event.metadata.category).toBe('DOMAIN');
    expect(typeof event.metadata.timestamp).toBe('string');
  });
});
