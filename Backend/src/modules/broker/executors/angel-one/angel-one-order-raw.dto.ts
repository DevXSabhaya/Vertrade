export interface AngelOnePlaceOrderRequestBody {
  variety: string;
  tradingsymbol: string;
  symboltoken: string;
  transactiontype: 'BUY' | 'SELL';
  exchange: string;
  ordertype: 'MARKET' | 'LIMIT';
  producttype: string;
  duration: string;
  price: string;
  squareoff: string;
  stoploss: string;
  quantity: string;
}

export interface AngelOneModifyOrderRequestBody {
  variety: string;
  orderid: string;
  ordertype: 'MARKET' | 'LIMIT';
  producttype: string;
  duration: string;
  price: string;
  quantity: string;
  tradingsymbol: string;
  symboltoken: string;
  exchange: string;
}

export interface AngelOneCancelOrderRequestBody {
  variety: string;
  orderid: string;
}

export interface AngelOneOrderMutationResponseBody {
  status: boolean;
  message: string;
  errorcode: string;
  data: { script: string; orderid: string } | null;
}

export interface AngelOneOrderBookEntry {
  orderid: string;
  status: string;
  tradingsymbol: string;
  symboltoken: string;
  exchange: string;
  quantity: string;
  price: string;
  filledshares: string;
  averageprice: string;
  updatetime: string;
  text?: string;
}

export interface AngelOneOrderBookResponseBody {
  status: boolean;
  message: string;
  errorcode: string;
  data: AngelOneOrderBookEntry[] | null;
}

export function isAngelOneOrderMutationResponseBody(
  value: unknown,
): value is AngelOneOrderMutationResponseBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.status === 'boolean' &&
    typeof candidate.message === 'string'
  );
}

export function isAngelOneOrderBookResponseBody(
  value: unknown,
): value is AngelOneOrderBookResponseBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.status === 'boolean' &&
    typeof candidate.message === 'string'
  );
}
