import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { MarketDataProviderType } from '../models/market-data-provider-type.enum';

export class MarketDataDisconnectedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'market-data.disconnected';
  readonly eventName = MarketDataDisconnectedEvent.EVENT_NAME;

  constructor(
    public readonly providerType: MarketDataProviderType,
    public readonly reason?: string,
  ) {
    super();
  }
}
