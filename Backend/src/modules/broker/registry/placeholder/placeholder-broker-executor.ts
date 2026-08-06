import type { IOrderExecutor } from '../../executors/order-executor.interface';
import type { OrderRequest } from '../../executors/models/order-request.model';
import type { OrderModification } from '../../executors/models/order-modification.model';
import type { ExitRequest } from '../../executors/models/exit-request.model';
import type { OrderResponse } from '../../executors/models/order-response.model';
import { BrokerNotImplementedException } from '../exceptions/broker-not-implemented.exception';

/**
 * Shared `IOrderExecutor` implementation for every broker that has a
 * registry entry but no real adapter yet — mirrors `PlaceholderBrokerAuth`.
 * Never wired into `ORDER_EXECUTOR`/`RoutingOrderExecutor` (the Trading
 * Engine's live/paper execution path is untouched by this registry); this
 * exists only so the Broker Manager can offer these brokers as
 * selectable/connectable entries with a real, typed, interface-satisfying
 * object rather than `null`, exactly matching what a live adapter will slot
 * into once written. Every method rejects before touching its arguments, so
 * they are intentionally unused — required only to satisfy IOrderExecutor's
 * shape.
 */
export class PlaceholderBrokerExecutor implements IOrderExecutor {
  constructor(private readonly brokerDisplayName: string) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  placeEntryOrder(request: OrderRequest): Promise<OrderResponse> {
    return this.reject();
  }

  modifyOrder(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    brokerOrderId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    changes: OrderModification,
  ): Promise<OrderResponse> {
    return this.reject();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cancelOrder(brokerOrderId: string): Promise<OrderResponse> {
    return this.reject();
  }

  exitPosition(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    brokerOrderId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: ExitRequest,
  ): Promise<OrderResponse> {
    return this.reject();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getOrderStatus(brokerOrderId: string): Promise<OrderResponse> {
    return this.reject();
  }

  private reject<T>(): Promise<T> {
    return Promise.reject(
      new BrokerNotImplementedException(this.brokerDisplayName),
    );
  }
}
