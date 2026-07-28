import { Injectable } from '@nestjs/common';
import { TradingModeService } from '@modules/trading-mode/trading-mode.service';
import type { IOrderExecutor } from './order-executor.interface';
import type { OrderRequest } from './models/order-request.model';
import type { OrderModification } from './models/order-modification.model';
import type { ExitRequest } from './models/exit-request.model';
import type { OrderResponse } from './models/order-response.model';
import { PaperExecutor } from './paper.executor';
import { AngelOneExecutor } from './angel-one/angel-one.executor';

/**
 * The `ORDER_EXECUTOR` DI token's concrete implementation — resolves to
 * whichever executor matches the deployment's *current* trading mode on
 * every call, via `TradingModeService` (persisted, switchable at runtime).
 *
 * Deliberately NOT used by `TradingEngineService`, whose trades pin their
 * own `mode` once at creation time and must keep using that same executor
 * for their entire lifecycle even if the deployment's current mode changes
 * later (see `TradingEngineService.executorFor`) — using "current mode" per
 * call there would let an in-flight trade's entry and exit legs silently
 * cross between Paper and a real broker. This class exists for the other,
 * genuinely current-mode-scoped consumers (e.g. `BrokerPositionProvider`,
 * reconciliation against whatever broker is live *right now*).
 */
@Injectable()
export class RoutingOrderExecutor implements IOrderExecutor {
  constructor(
    private readonly tradingModeService: TradingModeService,
    private readonly paperExecutor: PaperExecutor,
    private readonly angelOneExecutor: AngelOneExecutor,
  ) {}

  placeEntryOrder(request: OrderRequest): Promise<OrderResponse> {
    return this.current().placeEntryOrder(request);
  }

  modifyOrder(
    brokerOrderId: string,
    changes: OrderModification,
  ): Promise<OrderResponse> {
    return this.current().modifyOrder(brokerOrderId, changes);
  }

  cancelOrder(brokerOrderId: string): Promise<OrderResponse> {
    return this.current().cancelOrder(brokerOrderId);
  }

  exitPosition(
    brokerOrderId: string,
    request: ExitRequest,
  ): Promise<OrderResponse> {
    return this.current().exitPosition(brokerOrderId, request);
  }

  getOrderStatus(brokerOrderId: string): Promise<OrderResponse> {
    return this.current().getOrderStatus(brokerOrderId);
  }

  private current(): IOrderExecutor {
    return this.tradingModeService.getCurrentMode() === 'LIVE'
      ? this.angelOneExecutor
      : this.paperExecutor;
  }
}
