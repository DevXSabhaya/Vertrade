export interface DhanPlaceOrderRequestBody {
  dhanClientId: string;
  correlationId: string;
  transactionType: 'BUY' | 'SELL';
  exchangeSegment: string;
  productType: string;
  orderType: 'MARKET' | 'LIMIT';
  validity: string;
  securityId: string;
  quantity: number;
  disclosedQuantity: number;
  price: number;
  triggerPrice: number;
  afterMarketOrder: boolean;
}

export interface DhanModifyOrderRequestBody {
  dhanClientId: string;
  orderId: string;
  orderType: 'MARKET' | 'LIMIT';
  legName: string;
  quantity: number;
  price: number;
  disclosedQuantity: number;
  triggerPrice: number;
  validity: string;
}

export interface DhanOrderMutationResponseBody {
  orderId: string;
  orderStatus: string;
}

export interface DhanOrderBookEntry {
  orderId: string;
  orderStatus: string;
  tradingSymbol: string;
  securityId: string;
  exchangeSegment: string;
  quantity: number;
  price: number;
  filledQty: number;
  averageTradedPrice: number;
  updateTime: string;
  omsErrorDescription?: string | null;
}

/** DhanHQ returns a plain JSON error object (`{errorCode, errorType, errorMessage}`) on failure rather than a `{status:false}` envelope — this checks for that shape rather than assuming an HTTP error always throws before we get here. */
export interface DhanErrorResponseBody {
  errorCode: string;
  errorType: string;
  errorMessage: string;
}

export function isDhanOrderMutationResponseBody(
  value: unknown,
): value is DhanOrderMutationResponseBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.orderId === 'string' &&
    typeof candidate.orderStatus === 'string'
  );
}

export function isDhanErrorResponseBody(
  value: unknown,
): value is DhanErrorResponseBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.errorCode === 'string' &&
    typeof candidate.errorMessage === 'string'
  );
}

export function isDhanOrderBookEntry(
  value: unknown,
): value is DhanOrderBookEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.orderId === 'string' &&
    typeof candidate.orderStatus === 'string' &&
    typeof candidate.securityId === 'string'
  );
}

export function isDhanOrderBookResponseBody(
  value: unknown,
): value is DhanOrderBookEntry[] {
  return Array.isArray(value) && value.every(isDhanOrderBookEntry);
}
