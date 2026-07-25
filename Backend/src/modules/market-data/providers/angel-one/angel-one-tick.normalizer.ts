import { Result } from '@shared/types/result';
import { Tick } from '../../models/tick.model';
import type { MarketDataInstrument } from '../../models/market-data-instrument.model';
import { isAngelOneRawTick } from './angel-one-tick-raw.dto';

/**
 * Converts a SmartAPI-shaped raw tick into the broker-independent Tick model.
 * Never guesses: an unrecognized shape or a token that doesn't match the
 * instrument this tick was received for is a Result.fail, not a best-effort
 * mapping. Future brokers plug in by writing their own normalizer with this
 * same signature — nothing else in Market Data or the Trading Engine changes.
 */
export function normalizeAngelOneTick(
  raw: unknown,
  instrument: MarketDataInstrument,
  timestamp: Date,
  sequenceNumber: number,
): Result<Tick, string> {
  if (!isAngelOneRawTick(raw)) {
    return Result.fail('Malformed Angel One tick payload');
  }
  if (raw.token !== instrument.instrumentToken) {
    return Result.fail(
      `Tick token ${raw.token} does not match subscribed instrument ${instrument.instrumentToken}`,
    );
  }

  const lastPrice = raw.last_traded_price;
  return Result.ok(
    new Tick(
      instrument.instrumentToken,
      instrument.tradingSymbol,
      instrument.exchange,
      lastPrice,
      raw.best_bid_price ?? lastPrice,
      raw.best_ask_price ?? lastPrice,
      raw.volume_trade_for_the_day ?? 0,
      raw.open_interest ?? 0,
      timestamp,
      sequenceNumber,
    ),
  );
}
