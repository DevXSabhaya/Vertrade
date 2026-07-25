import type { OrderStatus } from '@modules/broker/executors/models/order-status.enum';

/**
 * What the broker itself reports for a trade's entry/exit legs, built by
 * querying IOrderExecutor.getOrderStatus() per known broker order id — the
 * only broker-position capability IOrderExecutor actually exposes (there is
 * no "list all positions" endpoint on the contract). See
 * BrokerPositionProvider's docstring for the full rationale.
 */
export interface BrokerPositionView {
  readonly tradeId: string;
  readonly entryOrderStatus: OrderStatus | null;
  readonly entryFilledQuantity: number | null;
  readonly entryAveragePrice: number | null;
  readonly exitOrderStatus: OrderStatus | null;
  readonly exitFilledQuantity: number | null;
  readonly exitAveragePrice: number | null;
}
