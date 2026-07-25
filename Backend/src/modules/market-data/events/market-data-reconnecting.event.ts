import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { MarketDataProviderType } from '../models/market-data-provider-type.enum';

export class MarketDataReconnectingEvent extends DomainEvent {
  readonly eventName = 'market-data.reconnecting';

  constructor(
    public readonly providerType: MarketDataProviderType,
    public readonly attempt: number,
  ) {
    super();
  }
}
