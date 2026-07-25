/**
 * Angel One SmartAPI order endpoint paths, per its publicly documented REST
 * contract. Not exercised against the real API in this environment (no real
 * broker calls in automated tests, and no live credentials) — verify against
 * a real/sandbox account before enabling Live trading.
 */
export const ANGEL_ONE_BASE_URL = 'https://apiconnect.angelbroking.com';
export const ANGEL_ONE_PLACE_ORDER_PATH =
  '/rest/secure/angelbroking/order/v1/placeOrder';
export const ANGEL_ONE_MODIFY_ORDER_PATH =
  '/rest/secure/angelbroking/order/v1/modifyOrder';
export const ANGEL_ONE_CANCEL_ORDER_PATH =
  '/rest/secure/angelbroking/order/v1/cancelOrder';
export const ANGEL_ONE_ORDER_BOOK_PATH =
  '/rest/secure/angelbroking/order/v1/getOrderBook';

export const ANGEL_ONE_VARIETY_NORMAL = 'NORMAL';
export const ANGEL_ONE_PRODUCT_TYPE_INTRADAY = 'INTRADAY';
export const ANGEL_ONE_DURATION_DAY = 'DAY';
