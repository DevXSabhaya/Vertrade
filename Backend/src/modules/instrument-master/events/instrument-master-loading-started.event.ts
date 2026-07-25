import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class InstrumentMasterLoadingStartedEvent extends DomainEvent {
  readonly eventName = 'instrument-master.loading.started';
}
