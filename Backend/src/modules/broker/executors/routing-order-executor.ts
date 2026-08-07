import { Injectable } from '@nestjs/common';
import type { IOrderExecutor } from './order-executor.interface';
import type { OrderRequest } from './models/order-request.model';
import type { OrderModification } from './models/order-modification.model';
import type { ExitRequest } from './models/exit-request.model';
import type { OrderResponse } from './models/order-response.model';
import { PaperExecutor } from './paper.executor';
import { DhanExecutor } from './dhan/dhan.executor';

/**
 * The `ORDER_EXECUTOR` DI token's concrete implementation — resolves to
 * `DhanExecutor` when the caller supplies a real `accountId`, or
 * `PaperExecutor` when it doesn't (`null`). This is the same signal
 * `TradingEngineService.executorFor` already keys on (a trade's own pinned
 * `brokerAccountId`, never a "deployment's current mode" — trading mode is
 * per-user now, so there is no single global mode to route by anyway).
 *
 * Deliberately NOT used by `TradingEngineService`, whose trades pin their
 * own executor once at creation time and must keep using it for their
 * entire lifecycle. This class exists for the other, genuinely
 * per-call-scoped consumers (e.g. `BrokerPositionProvider`, reconciliation
 * against whichever broker account a specific local position belongs to).
 */
@Injectable()
export class RoutingOrderExecutor implements IOrderExecutor {
  constructor(
    private readonly paperExecutor: PaperExecutor,
    private readonly dhanExecutor: DhanExecutor,
  ) {}

  placeEntryOrder(
    request: OrderRequest,
    accountId: string | null,
  ): Promise<OrderResponse> {
    return this.current(accountId).placeEntryOrder(request, accountId);
  }

  modifyOrder(
    brokerOrderId: string,
    changes: OrderModification,
    accountId: string | null,
  ): Promise<OrderResponse> {
    return this.current(accountId).modifyOrder(
      brokerOrderId,
      changes,
      accountId,
    );
  }

  cancelOrder(
    brokerOrderId: string,
    accountId: string | null,
  ): Promise<OrderResponse> {
    return this.current(accountId).cancelOrder(brokerOrderId, accountId);
  }

  exitPosition(
    brokerOrderId: string,
    request: ExitRequest,
    accountId: string | null,
  ): Promise<OrderResponse> {
    return this.current(accountId).exitPosition(
      brokerOrderId,
      request,
      accountId,
    );
  }

  getOrderStatus(
    brokerOrderId: string,
    accountId: string | null,
  ): Promise<OrderResponse> {
    return this.current(accountId).getOrderStatus(brokerOrderId, accountId);
  }

  private current(accountId: string | null): IOrderExecutor {
    return accountId ? this.dhanExecutor : this.paperExecutor;
  }
}
