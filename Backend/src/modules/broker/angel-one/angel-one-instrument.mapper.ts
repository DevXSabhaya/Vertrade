import { Instrument } from '@modules/instrument-master/entities/instrument.entity';
import { OptionType } from '@modules/instrument-master/option-type.enum';
import {
  AngelOneRawInstrument,
  isAngelOneRawInstrument,
} from './angel-one-instrument-raw.dto';

const EXPIRY_PATTERN = /^(\d{2})([A-Z]{3})(\d{4})$/;
const MONTH_INDEX: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

/** Angel One's raw strike values are scaled by 100 (e.g. "7720000.000000" = strike 77200). */
const STRIKE_SCALE_FACTOR = 100;

/**
 * Maps one raw Angel One instrument-master row into our normalized Instrument.
 * Returns null for malformed/unusable rows so a handful of bad rows never
 * fail the entire load — the caller filters nulls out.
 */
export function mapAngelOneInstrument(raw: unknown): Instrument | null {
  if (!isAngelOneRawInstrument(raw)) {
    return null;
  }

  const lotSize = Number(raw.lotsize);
  const tickSize = Number(raw.tick_size);

  if (
    !raw.token ||
    !raw.symbol ||
    !raw.exch_seg ||
    !Number.isFinite(lotSize) ||
    !Number.isFinite(tickSize)
  ) {
    return null;
  }

  const strike = parseStrike(raw.strike);
  const expiry = parseExpiry(raw.expiry);
  const optionType = inferOptionType(raw.symbol);

  return new Instrument(
    raw.token,
    raw.exch_seg,
    raw.instrumenttype || 'EQ',
    raw.symbol,
    raw.name,
    expiry,
    strike,
    optionType,
    lotSize,
    tickSize,
    computePrecision(tickSize),
  );
}

function parseStrike(raw: AngelOneRawInstrument['strike']): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value / STRIKE_SCALE_FACTOR;
}

function parseExpiry(raw: string): Date | null {
  if (!raw) {
    return null;
  }
  const match = EXPIRY_PATTERN.exec(raw.toUpperCase());
  if (!match) {
    return null;
  }
  const day = match[1];
  const monthAbbreviation = match[2];
  const year = match[3];
  const month = MONTH_INDEX[monthAbbreviation];
  if (month === undefined) {
    return null;
  }
  const date = new Date(Date.UTC(Number(year), month, Number(day), 23, 59, 59));
  return Number.isNaN(date.getTime()) ? null : date;
}

function inferOptionType(symbol: string): OptionType | null {
  if (symbol.endsWith('CE')) {
    return OptionType.CE;
  }
  if (symbol.endsWith('PE')) {
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
