/**
 * SmartAPI's documented JSON tick fields — a binary frame protocol is used in
 * production and must be decoded to this same shape before normalization;
 * see the caveat in angel-one-market-data.constants.ts.
 */
export interface AngelOneRawTick {
  readonly token: string;
  readonly last_traded_price: number;
  readonly best_bid_price?: number;
  readonly best_ask_price?: number;
  readonly volume_trade_for_the_day?: number;
  readonly open_interest?: number;
}

export function isAngelOneRawTick(value: unknown): value is AngelOneRawTick {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.token === 'string' &&
    typeof candidate.last_traded_price === 'number'
  );
}
