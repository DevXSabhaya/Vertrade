import { Instrument } from '@modules/instrument-master/entities/instrument.entity';
import { OptionType } from '@modules/instrument-master/option-type.enum';
import { DHAN_EXCHANGE_SEGMENT } from './dhan.constants';
import type { DhanExchangeSegment } from './dhan.constants';
import type { DhanRawInstrument } from './dhan-instrument-raw.dto';

/**
 * Maps a raw Dhan CSV row's (SEM_EXM_EXCH_ID, SEM_SEGMENT) pair to Dhan's own
 * exchangeSegment enum, used directly as OrderRequest.exchange and the
 * binary WS feed's subscription segment. Indices always map to IDX_I
 * regardless of exchange — verified against real NIFTY (NSE/I) and SENSEX
 * (BSE/I) rows. Never guesses: an unrecognized (exchange, segment) pair maps
 * to null and the row is dropped, rather than silently defaulting to some
 * arbitrary segment.
 */
function mapExchangeSegment(
  exchId: string,
  segment: string,
): DhanExchangeSegment | null {
  if (segment === 'I') {
    return DHAN_EXCHANGE_SEGMENT.IDX_I;
  }
  if (exchId === 'NSE') {
    if (segment === 'E') return DHAN_EXCHANGE_SEGMENT.NSE_EQ;
    if (segment === 'D') return DHAN_EXCHANGE_SEGMENT.NSE_FNO;
    if (segment === 'C') return DHAN_EXCHANGE_SEGMENT.NSE_CURRENCY;
    return null;
  }
  if (exchId === 'BSE') {
    if (segment === 'E') return DHAN_EXCHANGE_SEGMENT.BSE_EQ;
    if (segment === 'D') return DHAN_EXCHANGE_SEGMENT.BSE_FNO;
    if (segment === 'C') return DHAN_EXCHANGE_SEGMENT.BSE_CURRENCY;
    return null;
  }
  if (exchId === 'MCX') {
    if (segment === 'M') return DHAN_EXCHANGE_SEGMENT.MCX_COMM;
    return null;
  }
  return null;
}

function parseExpiry(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  // Dhan's SEM_EXPIRY_DATE is already "YYYY-MM-DD HH:MM:SS" — no custom
  // DDMMMYYYY parsing needed (unlike Angel One's instrument master).
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 23, 59, 59),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseStrike(raw: string): number | null {
  const value = Number(raw);
  // Dhan's SEM_STRIKE_PRICE is a direct float — no ×100 scale factor
  // (unlike Angel One's instrument master).
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function parseOptionType(raw: string): OptionType | null {
  if (raw === 'CE') {
    return OptionType.CE;
  }
  if (raw === 'PE') {
    return OptionType.PE;
  }
  return null;
}

function computePrecision(tickSize: number): number {
  if (!Number.isFinite(tickSize) || tickSize <= 0) {
    return 2;
  }
  const text = tickSize.toString();
  const dotIndex = text.indexOf('.');
  return dotIndex === -1 ? 0 : text.length - dotIndex - 1;
}

/**
 * Extracts the plain underlying symbol (e.g. "NIFTY", "RELIANCE",
 * "CRUDEOIL") that `InstrumentCache.findByUnderlying()` groups and looks
 * instruments up by. Verified against a real, live CSV download:
 * `SEM_TRADING_SYMBOL` is consistently `{UNDERLYING}-{expiry}-{strike}-{CE|
 * PE}` for options, `{UNDERLYING}-{expiry}-FUT` for futures, and just
 * `{UNDERLYING}` (no hyphen) for equities and raw index rows — so the
 * underlying is always everything before the first hyphen.
 *
 * `SM_SYMBOL_NAME` — used here until this was audited — turned out to be
 * wrong for this purpose: it's a series/group label (e.g. "BSXOPT" for
 * SENSEX options, "RELIOPT" for Reliance options), not the underlying name,
 * and is completely EMPTY for NSE index options (NIFTY, BANKNIFTY,
 * FINNIFTY, MIDCPNIFTY) — which made every NSE index option resolve to a
 * unique, ungroupable "underlying" (the full SEM_CUSTOM_SYMBOL fallback,
 * e.g. "NIFTY 29 SEP 29150 CALL") and silently broke resolution for exactly
 * those four underlyings.
 */
function parseUnderlying(tradingSymbol: string): string {
  const hyphenIndex = tradingSymbol.indexOf('-');
  return (
    hyphenIndex === -1 ? tradingSymbol : tradingSymbol.slice(0, hyphenIndex)
  ).trim();
}

/**
 * Maps one raw Dhan instrument-master CSV row into our normalized
 * Instrument. Returns null for malformed/unusable/unrecognized rows so a
 * handful of bad rows never fail the entire load — the caller filters
 * nulls out.
 */
export function mapDhanInstrument(raw: DhanRawInstrument): Instrument | null {
  const lotSize = Number(raw.SEM_LOT_UNITS);
  const tickSize = Number(raw.SEM_TICK_SIZE);
  const exchangeSegment = mapExchangeSegment(
    raw.SEM_EXM_EXCH_ID,
    raw.SEM_SEGMENT,
  );

  if (
    !raw.SEM_SMST_SECURITY_ID ||
    !raw.SEM_TRADING_SYMBOL ||
    !exchangeSegment ||
    !Number.isFinite(lotSize) ||
    !Number.isFinite(tickSize)
  ) {
    return null;
  }

  return new Instrument(
    raw.SEM_SMST_SECURITY_ID,
    exchangeSegment,
    raw.SEM_INSTRUMENT_NAME || 'EQUITY',
    raw.SEM_TRADING_SYMBOL,
    parseUnderlying(raw.SEM_TRADING_SYMBOL),
    parseExpiry(raw.SEM_EXPIRY_DATE),
    parseStrike(raw.SEM_STRIKE_PRICE),
    parseOptionType(raw.SEM_OPTION_TYPE),
    lotSize,
    tickSize,
    computePrecision(tickSize),
  );
}
