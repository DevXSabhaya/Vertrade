import type { BaseEvent } from './events/base.event';

/**
 * Business modules depend only on this interface, never on the concrete event
 * bus implementation — so swapping the in-process EventEmitter for Redis
 * Streams/Kafka later requires no change to any publisher or subscriber.
 */
export interface IEventBus {
  publish(event: BaseEvent): void;

  subscribe<T extends BaseEvent = BaseEvent>(
    eventName: string,
    handler: (event: T) => void | Promise<void>,
  ): void;

  /**
   * Used by cross-cutting subscribers (audit/application logging) that must
   * observe every event regardless of name.
   */
  subscribeToAll(handler: (event: BaseEvent) => void | Promise<void>): void;
}
