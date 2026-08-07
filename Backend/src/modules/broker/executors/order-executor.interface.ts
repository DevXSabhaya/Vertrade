import type { OrderRequest } from './models/order-request.model';
import type { OrderModification } from './models/order-modification.model';
import type { ExitRequest } from './models/exit-request.model';
import type { OrderResponse } from './models/order-response.model';

/**
 * The Trading Engine depends only on this interface — never on PaperExecutor
 * or DhanExecutor directly, and never on any broker-specific detail. Adding
 * another broker later means writing one new class implementing this
 * interface; nothing else changes.
 *
 * Every method takes `accountId`: the `BrokerAccount.accountId` whose
 * session/credentials this specific order should route through. `null` for
 * Paper trades (which have no broker account at all — `PaperExecutor`
 * ignores the parameter entirely); always a real, owned account id for
 * Live trades. This is what makes order routing per-account rather than a
 * single process-wide broker session — see `BrokerSessionManager`.
 *
 * PaperExecutor and DhanExecutor must be behaviorally interchangeable — both
 * are run through the exact same contract test suite
 * (contract/order-executor.contract.ts).
 */
export interface IOrderExecutor {
  placeEntryOrder(
    request: OrderRequest,
    accountId: string | null,
  ): Promise<OrderResponse>;
  modifyOrder(
    brokerOrderId: string,
    changes: OrderModification,
    accountId: string | null,
  ): Promise<OrderResponse>;
  cancelOrder(
    brokerOrderId: string,
    accountId: string | null,
  ): Promise<OrderResponse>;
  exitPosition(
    brokerOrderId: string,
    request: ExitRequest,
    accountId: string | null,
  ): Promise<OrderResponse>;
  getOrderStatus(
    brokerOrderId: string,
    accountId: string | null,
  ): Promise<OrderResponse>;
}
