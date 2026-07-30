/**
 * DhanHQ v2 Live Market Feed WebSocket endpoint per its publicly documented
 * binary protocol (https://dhanhq.co/docs/v2/live-market-feed/). Not
 * exercised against the real feed in this environment (no live credentials,
 * and automated tests must never open a real connection) — verify against a
 * real/sandbox account before enabling Live market data, same caveat as
 * every other Dhan adapter in this codebase.
 */
export const DHAN_MARKET_DATA_WS_URL = 'wss://api-feed.dhan.co';

/**
 * Feed Response Codes, verified against DhanHQ's official Annexure
 * reference table (https://dhanhq.co/docs/v2/annexure/): 1=Index,
 * 2=Ticker, 4=Quote, 5=OI, 6=Prev Close, 7=Market Status, 8=Full,
 * 50=Disconnect. There is no separate application-level ping/pong message
 * — the socket-level ping/pong (handled transparently by the underlying
 * WebSocket implementation) keeps the raw connection alive; see
 * DhanMarketDataProvider's own heartbeat handling for how this app derives
 * a liveness signal without one.
 */
export const DHAN_FEED_RESPONSE_CODE_DISCONNECT = 50;
export const DHAN_FEED_RESPONSE_CODE_TICKER = 2;
export const DHAN_FEED_RESPONSE_CODE_QUOTE = 4;
export const DHAN_FEED_RESPONSE_CODE_OI = 5;
export const DHAN_FEED_RESPONSE_CODE_FULL = 8;

/**
 * Request codes, verified against DhanHQ's official Annexure reference
 * table: 15/16 subscribe/unsubscribe Ticker, 17/18 subscribe/unsubscribe
 * Quote, 21/22 subscribe/unsubscribe Full, 23/24 subscribe/unsubscribe
 * 20-depth. This app always subscribes at Full (21/22) — the richest
 * packet type (LTP + bid/ask/volume/OI/5-level depth) for every instrument.
 */
export const DHAN_REQUEST_CODE_SUBSCRIBE_FULL = 21;
export const DHAN_REQUEST_CODE_UNSUBSCRIBE_FULL = 22;

/** Dhan allows at most 100 instruments per subscribe/unsubscribe request message. */
export const DHAN_MAX_INSTRUMENTS_PER_REQUEST = 100;
