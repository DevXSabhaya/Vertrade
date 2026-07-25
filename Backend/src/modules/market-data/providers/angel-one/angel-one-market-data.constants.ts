/**
 * SmartAPI WebSocket Streaming endpoint per Angel One's public documentation.
 * Not exercised against the real feed in this environment (no live
 * credentials, and this phase explicitly forbids opening a real connection)
 * — verify against a real/sandbox account before enabling Live market data,
 * same caveat as every other Angel One adapter in this codebase. The real
 * production feed uses a binary frame protocol; this adapter's normalizer
 * handles SmartAPI's JSON tick representation and must be re-verified against
 * the official binary protocol spec before Live use.
 */
export const ANGEL_ONE_MARKET_DATA_WS_URL =
  'wss://smartapisocket.angelone.in/smart-stream';

export const ANGEL_ONE_HEARTBEAT_PING_MESSAGE = 'ping';
export const ANGEL_ONE_HEARTBEAT_PONG_MESSAGE = 'pong';

export const ANGEL_ONE_SUBSCRIBE_ACTION = 1;
export const ANGEL_ONE_UNSUBSCRIBE_ACTION = 0;
