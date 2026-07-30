/**
 * DhanHQ's publicly documented, unauthenticated instrument/security-master
 * CSV download (https://dhanhq.co/docs/v2/annexure/). Verified against a
 * real live download: 205,808 rows, 16 columns, no embedded quotes/commas —
 * safe to parse with a plain `split(',')`. This constant lives only inside
 * the Dhan adapter; nothing outside modules/broker/dhan knows it exists.
 */
export const DHAN_INSTRUMENT_MASTER_URL =
  'https://images.dhan.co/api-data/api-scrip-master.csv';

/**
 * DhanHQ's exchange-segment values, used both as the REST `exchangeSegment`
 * string and (via DHAN_EXCHANGE_SEGMENT_CODE below) the 1-byte integer field
 * in the binary WebSocket feed header. Indices (NIFTY, BANKNIFTY, SENSEX,
 * ...) always use IDX_I regardless of which exchange lists them.
 */
export const DHAN_EXCHANGE_SEGMENT = {
  IDX_I: 'IDX_I',
  NSE_EQ: 'NSE_EQ',
  NSE_FNO: 'NSE_FNO',
  NSE_CURRENCY: 'NSE_CURRENCY',
  BSE_EQ: 'BSE_EQ',
  BSE_FNO: 'BSE_FNO',
  BSE_CURRENCY: 'BSE_CURRENCY',
  MCX_COMM: 'MCX_COMM',
} as const;

export type DhanExchangeSegment =
  (typeof DHAN_EXCHANGE_SEGMENT)[keyof typeof DHAN_EXCHANGE_SEGMENT];

/** Integer form of each exchange segment, used in the binary WS feed's 1-byte header field. */
export const DHAN_EXCHANGE_SEGMENT_CODE: Record<DhanExchangeSegment, number> = {
  IDX_I: 0,
  NSE_EQ: 1,
  NSE_FNO: 2,
  NSE_CURRENCY: 3,
  BSE_EQ: 4,
  MCX_COMM: 5,
  BSE_CURRENCY: 7,
  BSE_FNO: 8,
};
