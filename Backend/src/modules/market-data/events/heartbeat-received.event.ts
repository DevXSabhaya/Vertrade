import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { MarketDataProviderType } from '../models/market-data-provider-type.enum';

export class HeartbeatReceivedEvent extends DomainEvent {
  readonly eventName = 'market-data.heartbeat.received';

  constructor(public readonly providerType: MarketDataProviderType) {
    super();
  }
}
