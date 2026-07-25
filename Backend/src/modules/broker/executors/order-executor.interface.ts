import type { OrderRequest } from './models/order-request.model';
import type { OrderModification } from './models/order-modification.model';
import type { ExitRequest } from './models/exit-request.model';
import type { OrderResponse } from './models/order-response.model';

/**
 * The Trading Engine (a later phase) will depend only on this interface —
 * never on PaperExecutor or AngelOneExecutor directly, and never on any
 * broker-specific detail. Adding Zerodha/Upstox/Fyers/Shoonya later means
 * writing one new class implementing this interface; nothing else changes.
 *
 * PaperExecutor and AngelOneExecutor must be behaviorally interchangeable —
 * both are run through the exact same contract test suite
 * (contract/order-executor.contract.ts).
 */
export interface IOrderExecutor {
  placeEntryOrder(request: OrderRequest): Promise<OrderResponse>;
  modifyOrder(
    brokerOrderId: string,
    changes: OrderModification,
  ): Promise<OrderResponse>;
  cancelOrder(brokerOrderId: string): Promise<OrderResponse>;
  exitPosition(
    brokerOrderId: string,
    request: ExitRequest,
  ): Promise<OrderResponse>;
  getOrderStatus(brokerOrderId: string): Promise<OrderResponse>;
}
