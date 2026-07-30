import { Result } from '@shared/types/result';
import { Tick } from '../../models/tick.model';
import type { MarketDataInstrument } from '../../models/market-data-instrument.model';
import type { DhanParsedTick } from './dhan-tick-binary.parser';

/**
 * Converts a parsed Dhan binary tick into the broker-independent Tick model.
 * Never guesses: a security id that doesn't match the instrument this tick
 * was received for is a Result.fail, not a best-effort mapping. Future
 * brokers plug in by writing their own normalizer with this same signature —
 * nothing else in Market Data or the Trading Engine changes.
 */
export function normalizeDhanTick(
  raw: DhanParsedTick,
  instrument: MarketDataInstrument,
  timestamp: Date,
  sequenceNumber: number,
): Result<Tick, string> {
  if (raw.securityId !== instrument.instrumentToken) {
    return Result.fail(
      `Tick securityId ${raw.securityId} does not match subscribed instrument ${instrument.instrumentToken}`,
    );
  }

  return Result.ok(
    new Tick(
      instrument.instrumentToken,
      instrument.tradingSymbol,
      instrument.exchange,
      raw.lastPrice,
      raw.bestBid ?? raw.lastPrice,
      raw.bestAsk ?? raw.lastPrice,
      raw.volume ?? 0,
      raw.openInterest ?? 0,
      timestamp,
      sequenceNumber,
    ),
  );
}
