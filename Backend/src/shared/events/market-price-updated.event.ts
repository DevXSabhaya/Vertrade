import { DomainEvent } from '@core/event-bus/events/domain-event.base';

/**
 * The shared contract between the Market Data module (publisher) and the
 * Trading Engine (subscriber) — deliberately not owned by either module, so
 * neither has to import the other to agree on this event's shape. Originally
 * forward-declared inside the Trading Engine module in Phase 5, before a
 * publisher existed; relocated here in Phase 6 now that Market Data is the
 * real publisher, per the Clean Architecture dependency rule that Market Data
 * must never import the Trading Engine.
 */
export class MarketPriceUpdatedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'market.price.updated';
  readonly eventName = MarketPriceUpdatedEvent.EVENT_NAME;

  constructor(
    public readonly instrumentToken: string,
    public readonly price: number,
  ) {
    super();
  }
}
