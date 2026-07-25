import { Result } from '@shared/types/result';
import { BrokerOrderApiException } from '../exceptions/broker-order-api.exception';
import { OrderRequest } from '../models/order-request.model';
import { OrderModification } from '../models/order-modification.model';
import { OrderResponse } from '../models/order-response.model';
import { OrderSide } from '../models/order-side.enum';
import { OrderPriceType } from '../models/order-price-type.enum';
import { OrderStatus } from '../models/order-status.enum';
import type { AngelOneOrderBookEntry } from './angel-one-order-raw.dto';
import {
  ANGEL_ONE_DURATION_DAY,
  ANGEL_ONE_PRODUCT_TYPE_INTRADAY,
  ANGEL_ONE_VARIETY_NORMAL,
} from './angel-one-order.constants';
import type {
  AngelOneCancelOrderRequestBody,
  AngelOneModifyOrderRequestBody,
  AngelOnePlaceOrderRequestBody,
} from './angel-one-order-raw.dto';

/**
 * Angel One's own status strings, per its publicly documented order book
 * response. Deliberately does NOT fall back to a guessed status for anything
 * unrecognized — see mapAngelOneOrderStatus below.
 */
const STATUS_MAP: Record<string, OrderStatus> = {
  open: OrderStatus.OPEN,
  'open pending': OrderStatus.OPEN,
  'trigger pending': OrderStatus.OPEN,
  complete: OrderStatus.FILLED,
  cancelled: OrderStatus.CANCELLED,
  rejected: OrderStatus.REJECTED,
};

export function buildPlaceOrderRequestBody(
  request: OrderRequest,
): AngelOnePlaceOrderRequestBody {
  return {
    variety: ANGEL_ONE_VARIETY_NORMAL,
    tradingsymbol: request.tradingSymbol,
    symboltoken: request.instrumentToken,
    transactiontype: request.side === OrderSide.BUY ? 'BUY' : 'SELL',
    exchange: request.exchange,
    ordertype: request.priceType === OrderPriceType.LIMIT ? 'LIMIT' : 'MARKET',
    producttype: ANGEL_ONE_PRODUCT_TYPE_INTRADAY,
    duration: ANGEL_ONE_DURATION_DAY,
    price:
      request.priceType === OrderPriceType.LIMIT
        ? String(request.price ?? 0)
        : '0',
    squareoff: '0',
    stoploss: '0',
    quantity: String(request.quantity),
  };
}

/**
 * Angel One's modify API is stateless — it requires the order's full current
 * details resent, not just the delta — so the caller must supply the current
 * order-book entry (the broker's own source of truth) rather than us tracking
 * a separate local copy of what was originally submitted.
 */
export function buildModifyOrderRequestBody(
  entry: Pick<
    AngelOneOrderBookEntry,
    | 'orderid'
    | 'tradingsymbol'
    | 'symboltoken'
    | 'exchange'
    | 'quantity'
    | 'price'
  >,
  changes: OrderModification,
): AngelOneModifyOrderRequestBody {
  const currentPrice = Number(entry.price);
  const priceType =
    changes.priceType ??
    (currentPrice > 0 ? OrderPriceType.LIMIT : OrderPriceType.MARKET);

  return {
    variety: ANGEL_ONE_VARIETY_NORMAL,
    orderid: entry.orderid,
    ordertype: priceType === OrderPriceType.LIMIT ? 'LIMIT' : 'MARKET',
    producttype: ANGEL_ONE_PRODUCT_TYPE_INTRADAY,
    duration: ANGEL_ONE_DURATION_DAY,
    price: String(changes.price ?? entry.price),
    quantity: String(changes.quantity ?? entry.quantity),
    tradingsymbol: entry.tradingsymbol,
    symboltoken: entry.symboltoken,
    exchange: entry.exchange,
  };
}

export function buildCancelOrderRequestBody(
  brokerOrderId: string,
): AngelOneCancelOrderRequestBody {
  return { variety: ANGEL_ONE_VARIETY_NORMAL, orderid: brokerOrderId };
}

/** Never guesses: an unrecognized status string is a Result failure, not a silent default. */
export function mapAngelOneOrderStatus(
  rawStatus: string,
): Result<OrderStatus, string> {
  const normalized = rawStatus.trim().toLowerCase();
  const mapped = STATUS_MAP[normalized];
  if (!mapped) {
    return Result.fail(`Unrecognized Angel One order status: "${rawStatus}"`);
  }
  return Result.ok(mapped);
}

export function mapOrderBookEntryToResponse(
  entry: AngelOneOrderBookEntry,
): OrderResponse {
  const statusResult = mapAngelOneOrderStatus(entry.status);
  if (statusResult.isFailure) {
    throw new BrokerOrderApiException(statusResult.error);
  }

  const filledQuantity = Number(entry.filledshares);
  const averagePriceRaw = Number(entry.averageprice);

  return new OrderResponse(
    entry.orderid,
    statusResult.value,
    Number.isFinite(filledQuantity) ? filledQuantity : 0,
    Number.isFinite(averagePriceRaw) && averagePriceRaw > 0
      ? averagePriceRaw
      : null,
    entry.updatetime ? new Date(entry.updatetime) : new Date(),
    entry.text,
  );
}
