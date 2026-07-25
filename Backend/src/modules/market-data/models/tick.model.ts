/**
 * Broker-independent, normalized market tick. Whichever IMarketDataProvider
 * produced this, the shape is identical — no broker-specific field names or
 * raw payloads ever leak past the provider that produced them.
 */
export class Tick {
  constructor(
    public readonly instrumentToken: string,
    public readonly tradingSymbol: string,
    public readonly exchange: string,
    public readonly lastPrice: number,
    public readonly bid: number,
    public readonly ask: number,
    public readonly volume: number,
    public readonly openInterest: number,
    public readonly timestamp: Date,
    public readonly sequenceNumber: number,
  ) {}
}
