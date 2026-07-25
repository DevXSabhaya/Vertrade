/**
 * Re-export shim: this event moved to @shared/events in Phase 6, since Market
 * Data (the real publisher, added in Phase 6) must never import the Trading
 * Engine module — the event needed a neutral shared home. Kept here so
 * nothing importing from this original Phase 5 path breaks.
 */
export { MarketPriceUpdatedEvent } from '@shared/events/market-price-updated.event';
