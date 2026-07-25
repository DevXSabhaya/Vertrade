import type { OrderStatus } from './order-status.enum';

/**
 * Broker-independent execution result. Whatever IOrderExecutor implementation
 * produced this, the shape is identical — nothing upstream can tell which
 * broker (or Paper) is behind it.
 */
export class OrderResponse {
  constructor(
    public readonly brokerOrderId: string,
    public readonly status: OrderStatus,
    public readonly filledQuantity: number,
    public readonly averagePrice: number | null,
    public readonly updatedAt: Date,
    public readonly message?: string,
  ) {}
}
