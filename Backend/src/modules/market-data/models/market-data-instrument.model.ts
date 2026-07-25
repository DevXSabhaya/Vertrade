/**
 * A broker-independent instrument identity to subscribe/unsubscribe on —
 * the same shape the Instrument Resolver Service (Phase 3) produces, so
 * nothing upstream of Market Data ever needs to know a provider's own
 * instrument identifiers.
 */
export class MarketDataInstrument {
  constructor(
    public readonly exchange: string,
    public readonly tradingSymbol: string,
    public readonly instrumentToken: string,
  ) {}
}
