import { EventCategory } from '@shared/enums/event-category.enum';
import { MarketPriceUpdatedEvent } from './market-price-updated.event';

describe('MarketPriceUpdatedEvent', () => {
  it('carries the instrument token and price with DOMAIN category metadata', () => {
    const event = new MarketPriceUpdatedEvent('TOKEN-1', 123.45);

    expect(event.eventName).toBe('market.price.updated');
    expect(event.eventName).toBe(MarketPriceUpdatedEvent.EVENT_NAME);
    expect(event.instrumentToken).toBe('TOKEN-1');
    expect(event.price).toBe(123.45);
    expect(event.metadata.category).toBe(EventCategory.DOMAIN);
  });
});
