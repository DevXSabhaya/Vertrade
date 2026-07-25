import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IEventBus } from './event-bus.interface';
import type { BaseEvent } from './events/base.event';

@Injectable()
export class EventEmitterEventBus implements IEventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  publish(event: BaseEvent): void {
    this.emitter.emit(event.eventName, event);
  }

  subscribe<T extends BaseEvent = BaseEvent>(
    eventName: string,
    handler: (event: T) => void | Promise<void>,
  ): void {
    this.emitter.on(eventName, (payload: unknown) => {
      void handler(payload as T);
    });
  }

  subscribeToAll(handler: (event: BaseEvent) => void | Promise<void>): void {
    this.emitter.onAny((_eventName: string | string[], payload: unknown) => {
      void handler(payload as BaseEvent);
    });
  }
}
