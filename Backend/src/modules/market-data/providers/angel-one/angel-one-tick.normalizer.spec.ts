import { MarketDataInstrument } from '../../models/market-data-instrument.model';
import { normalizeAngelOneTick } from './angel-one-tick.normalizer';

const instrument = new MarketDataInstrument('NFO', 'NIFTY24500CE', 'TOKEN-1');
const timestamp = new Date('2026-01-01T10:00:00Z');

describe('normalizeAngelOneTick', () => {
  it('maps a well-formed raw tick to a normalized Tick', () => {
    const result = normalizeAngelOneTick(
      {
        token: 'TOKEN-1',
        last_traded_price: 123.45,
        best_bid_price: 123.4,
        best_ask_price: 123.5,
        volume_trade_for_the_day: 1000,
        open_interest: 500,
      },
      instrument,
      timestamp,
      7,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.value).toEqual(
      expect.objectContaining({
        instrumentToken: 'TOKEN-1',
        tradingSymbol: 'NIFTY24500CE',
        exchange: 'NFO',
        lastPrice: 123.45,
        bid: 123.4,
        ask: 123.5,
        volume: 1000,
        openInterest: 500,
        timestamp,
        sequenceNumber: 7,
      }),
    );
  });

  it('defaults bid/ask to lastPrice and volume/OI to 0 when absent', () => {
    const result = normalizeAngelOneTick(
      { token: 'TOKEN-1', last_traded_price: 100 },
      instrument,
      timestamp,
      1,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.value.bid).toBe(100);
    expect(result.value.ask).toBe(100);
    expect(result.value.volume).toBe(0);
    expect(result.value.openInterest).toBe(0);
  });

  it('fails on a malformed payload rather than guessing', () => {
    const result = normalizeAngelOneTick(
      { garbage: true },
      instrument,
      timestamp,
      1,
    );
    expect(result.isFailure).toBe(true);
  });

  it('fails when the tick token does not match the subscribed instrument', () => {
    const result = normalizeAngelOneTick(
      { token: 'WRONG-TOKEN', last_traded_price: 100 },
      instrument,
      timestamp,
      1,
    );
    expect(result.isFailure).toBe(true);
  });
});
