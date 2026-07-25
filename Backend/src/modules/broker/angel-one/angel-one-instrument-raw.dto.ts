/**
 * Shape of a single row in Angel One's publicly published instrument master
 * JSON, per SmartAPI's documented format. Not verified against a live download
 * in this environment (no real broker calls in automated tests) — cross-check
 * against a real download before enabling Live trading.
 */
export interface AngelOneRawInstrument {
  token: string;
  symbol: string;
  name: string;
  expiry: string;
  strike: string;
  lotsize: string;
  instrumenttype: string;
  exch_seg: string;
  tick_size: string;
}

export function isAngelOneRawInstrument(
  value: unknown,
): value is AngelOneRawInstrument {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.token === 'string' &&
    typeof candidate.symbol === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.expiry === 'string' &&
    typeof candidate.strike === 'string' &&
    typeof candidate.lotsize === 'string' &&
    typeof candidate.instrumenttype === 'string' &&
    typeof candidate.exch_seg === 'string' &&
    typeof candidate.tick_size === 'string'
  );
}
