import type { IOrderExecutor } from '../order-executor.interface';
import { OrderModification } from '../models/order-modification.model';
import { ExitRequest } from '../models/exit-request.model';
import { OrderStatus } from '../models/order-status.enum';
import type { OrderResponse } from '../models/order-response.model';

/**
 * Each implementation's own test setup decides HOW to produce these two
 * preconditions (e.g. PaperExecutor uses queueNextFill(); DhanExecutor's
 * test wires its mocked HTTP client to respond accordingly) — the contract
 * only asserts on the resulting OBSERVABLE BEHAVIOR, which is exactly what
 * Liskov substitutability requires.
 */
export interface OrderExecutorContractContext {
  executor: IOrderExecutor;
  /** The account id every contract-test call routes through — `null` for PaperExecutor (no broker account), a fake id for DhanExecutor. */
  accountId: string | null;
  /** Produces an order that ends up FILLED (or PARTIALLY_FILLED) immediately after placement. */
  placeFillableOrder(): Promise<OrderResponse>;
  /** Produces an order that remains OPEN (not yet filled) after placement. */
  placeOpenOrder(): Promise<OrderResponse>;
}

/**
 * Run against BOTH PaperExecutor and DhanExecutor. If either fails one of
 * these, the two implementations are not truly interchangeable and the
 * Trading Engine (a later phase) could not safely depend on IOrderExecutor alone.
 */
export function describeOrderExecutorContract(
  name: string,
  setup: () =>
    OrderExecutorContractContext | Promise<OrderExecutorContractContext>,
): void {
  describe(`IOrderExecutor contract — ${name}`, () => {
    let ctx: OrderExecutorContractContext;

    beforeEach(async () => {
      ctx = await setup();
    });

    it('places an order and returns a non-empty broker order id with a known status', async () => {
      const response = await ctx.placeFillableOrder();
      expect(typeof response.brokerOrderId).toBe('string');
      expect(response.brokerOrderId.length).toBeGreaterThan(0);
      expect(Object.values(OrderStatus)).toContain(response.status);
    });

    it('fills (fully or partially) a fillable order', async () => {
      const response = await ctx.placeFillableOrder();
      expect([OrderStatus.FILLED, OrderStatus.PARTIALLY_FILLED]).toContain(
        response.status,
      );
      expect(response.filledQuantity).toBeGreaterThan(0);
    });

    it('reflects the placed order via getOrderStatus using the same broker order id', async () => {
      const placed = await ctx.placeFillableOrder();
      const fetched = await ctx.executor.getOrderStatus(
        placed.brokerOrderId,
        ctx.accountId,
      );
      expect(fetched.brokerOrderId).toBe(placed.brokerOrderId);
      expect(fetched.status).toBe(placed.status);
    });

    it('places an order that remains OPEN when configured to', async () => {
      const opened = await ctx.placeOpenOrder();
      expect(opened.status).toBe(OrderStatus.OPEN);
    });

    it('modifies an open order and the change is reflected for the same order id', async () => {
      const opened = await ctx.placeOpenOrder();
      const modified = await ctx.executor.modifyOrder(
        opened.brokerOrderId,
        new OrderModification(5),
        ctx.accountId,
      );
      expect(modified.brokerOrderId).toBe(opened.brokerOrderId);
    });

    it('cancels an open order, and getOrderStatus reflects CANCELLED afterward', async () => {
      const opened = await ctx.placeOpenOrder();
      await ctx.executor.cancelOrder(opened.brokerOrderId, ctx.accountId);
      const fetched = await ctx.executor.getOrderStatus(
        opened.brokerOrderId,
        ctx.accountId,
      );
      expect(fetched.status).toBe(OrderStatus.CANCELLED);
    });

    it('rejects cancelling an order that is already filled', async () => {
      const filled = await ctx.placeFillableOrder();
      await expect(
        ctx.executor.cancelOrder(filled.brokerOrderId, ctx.accountId),
      ).rejects.toThrow();
    });

    it('exits a filled position, returning a new order id distinct from the original', async () => {
      const filled = await ctx.placeFillableOrder();
      const exited = await ctx.executor.exitPosition(
        filled.brokerOrderId,
        new ExitRequest(filled.filledQuantity),
        ctx.accountId,
      );

      expect(exited.brokerOrderId).not.toBe(filled.brokerOrderId);
      expect(exited.status).toBe(OrderStatus.FILLED);

      const originalAfterExit = await ctx.executor.getOrderStatus(
        filled.brokerOrderId,
        ctx.accountId,
      );
      expect(originalAfterExit.status).toBe(OrderStatus.EXITED);
    });

    it('throws when getting the status of an unknown order id', async () => {
      await expect(
        ctx.executor.getOrderStatus('DOES-NOT-EXIST', ctx.accountId),
      ).rejects.toThrow();
    });

    it('throws when modifying an unknown order id', async () => {
      await expect(
        ctx.executor.modifyOrder(
          'DOES-NOT-EXIST',
          new OrderModification(1),
          ctx.accountId,
        ),
      ).rejects.toThrow();
    });

    it('throws when cancelling an unknown order id', async () => {
      await expect(
        ctx.executor.cancelOrder('DOES-NOT-EXIST', ctx.accountId),
      ).rejects.toThrow();
    });
  });
}
