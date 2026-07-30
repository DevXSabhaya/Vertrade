import { Result } from '@shared/types/result';
import { BrokerOrderApiException } from '../exceptions/broker-order-api.exception';
import { OrderRequest } from '../models/order-request.model';
import { OrderModification } from '../models/order-modification.model';
import { OrderResponse } from '../models/order-response.model';
import { OrderSide } from '../models/order-side.enum';
import { OrderPriceType } from '../models/order-price-type.enum';
import { OrderStatus } from '../models/order-status.enum';
import type { DhanOrderBookEntry } from './dhan-order-raw.dto';
import {
  DHAN_LEG_NAME_ENTRY,
  DHAN_PRODUCT_TYPE_INTRADAY,
  DHAN_VALIDITY_DAY,
} from './dhan-order.constants';
import type {
  DhanModifyOrderRequestBody,
  DhanPlaceOrderRequestBody,
} from './dhan-order-raw.dto';

/**
 * DhanHQ's own order-status strings, verified against the official Annexure
 * reference table (https://dhanhq.co/docs/v2/annexure/), which lists
 * exactly eight values: TRANSIT, PENDING, CLOSED, TRIGGERED, REJECTED,
 * CANCELLED, PART_TRADED, TRADED. CLOSED and TRIGGERED are documented as
 * Super Order (bracket/cover order)-only states — this executor only ever
 * places plain INTRADAY orders, so they are deliberately left unmapped
 * (Result.fail if somehow encountered) rather than guessed at.
 *
 * An earlier version of this map included `'trigger pending'` and
 * `'expired'` — neither appears in Dhan's official status list; both were
 * an unverified carry-over assumption and have been removed. Deliberately
 * does NOT fall back to a guessed status for anything unrecognized — see
 * mapDhanOrderStatus below.
 */
const STATUS_MAP: Record<string, OrderStatus> = {
  transit: OrderStatus.OPEN,
  pending: OrderStatus.OPEN,
  part_traded: OrderStatus.PARTIALLY_FILLED,
  traded: OrderStatus.FILLED,
  cancelled: OrderStatus.CANCELLED,
  rejected: OrderStatus.REJECTED,
};

export function buildPlaceOrderRequestBody(
  request: OrderRequest,
  dhanClientId: string,
  correlationId: string,
): DhanPlaceOrderRequestBody {
  return {
    dhanClientId,
    correlationId,
    transactionType: request.side === OrderSide.BUY ? 'BUY' : 'SELL',
    exchangeSegment: request.exchange,
    productType: DHAN_PRODUCT_TYPE_INTRADAY,
    orderType: request.priceType === OrderPriceType.LIMIT ? 'LIMIT' : 'MARKET',
    validity: DHAN_VALIDITY_DAY,
    securityId: request.instrumentToken,
    quantity: request.quantity,
    disclosedQuantity: 0,
    price:
      request.priceType === OrderPriceType.LIMIT ? (request.price ?? 0) : 0,
    triggerPrice: 0,
    afterMarketOrder: false,
  };
}

/**
 * DhanHQ's modify API is stateless — it requires the order's full current
 * details resent, not just the delta — so the caller must supply the current
 * order-book entry (the broker's own source of truth) rather than us tracking
 * a separate local copy of what was originally submitted.
 */
export function buildModifyOrderRequestBody(
  entry: Pick<DhanOrderBookEntry, 'orderId' | 'quantity' | 'price'>,
  changes: OrderModification,
  dhanClientId: string,
): DhanModifyOrderRequestBody {
  const currentPrice = entry.price;
  const priceType =
    changes.priceType ??
    (currentPrice > 0 ? OrderPriceType.LIMIT : OrderPriceType.MARKET);

  return {
    dhanClientId,
    orderId: entry.orderId,
    orderType: priceType === OrderPriceType.LIMIT ? 'LIMIT' : 'MARKET',
    legName: DHAN_LEG_NAME_ENTRY,
    quantity: changes.quantity ?? entry.quantity,
    price: changes.price ?? entry.price,
    disclosedQuantity: 0,
    triggerPrice: 0,
    validity: DHAN_VALIDITY_DAY,
  };
}

/** Never guesses: an unrecognized status string is a Result failure, not a silent default. */
export function mapDhanOrderStatus(
  rawStatus: string,
): Result<OrderStatus, string> {
  const normalized = rawStatus.trim().toLowerCase();
  const mapped = STATUS_MAP[normalized];
  if (!mapped) {
    return Result.fail(`Unrecognized Dhan order status: "${rawStatus}"`);
  }
  return Result.ok(mapped);
}

export function mapOrderBookEntryToResponse(
  entry: DhanOrderBookEntry,
): OrderResponse {
  const statusResult = mapDhanOrderStatus(entry.orderStatus);
  if (statusResult.isFailure) {
    throw new BrokerOrderApiException(statusResult.error);
  }

  const filledQuantity = entry.filledQty;
  const averagePriceRaw = entry.averageTradedPrice;

  return new OrderResponse(
    entry.orderId,
    statusResult.value,
    Number.isFinite(filledQuantity) ? filledQuantity : 0,
    Number.isFinite(averagePriceRaw) && averagePriceRaw > 0
      ? averagePriceRaw
      : null,
    entry.updateTime ? new Date(entry.updateTime) : new Date(),
    entry.omsErrorDescription ?? undefined,
  );
}
