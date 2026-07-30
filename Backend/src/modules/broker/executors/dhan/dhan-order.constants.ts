/**
 * DhanHQ v2 order endpoint paths, per its publicly documented REST contract
 * (https://dhanhq.co/docs/v2/orders/). Not exercised against the real API in
 * this environment (no real broker calls in automated tests, and no live
 * credentials) — verify against a real/sandbox account before enabling Live
 * trading, same caveat every broker adapter in this codebase carries.
 */
export const DHAN_ORDERS_PATH = '/orders';

export const DHAN_PRODUCT_TYPE_INTRADAY = 'INTRADAY';
export const DHAN_VALIDITY_DAY = 'DAY';

/** Dhan's order-book "legName" for a plain (non-bracket, non-cover) order. */
export const DHAN_LEG_NAME_ENTRY = 'ENTRY_LEG';
