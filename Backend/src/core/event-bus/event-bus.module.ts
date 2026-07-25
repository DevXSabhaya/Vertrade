import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EVENT_BUS } from './event-bus.constants';
import { EventEmitterEventBus } from './event-emitter-event-bus';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: false,
    }),
  ],
  providers: [{ provide: EVENT_BUS, useClass: EventEmitterEventBus }],
  exports: [EVENT_BUS],
})
export class EventBusModule {}
