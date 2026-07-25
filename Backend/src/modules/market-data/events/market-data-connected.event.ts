import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { MarketDataProviderType } from '../models/market-data-provider-type.enum';

export class MarketDataConnectedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'market-data.connected';
  readonly eventName = MarketDataConnectedEvent.EVENT_NAME;

  constructor(public readonly providerType: MarketDataProviderType) {
    super();
  }
}
