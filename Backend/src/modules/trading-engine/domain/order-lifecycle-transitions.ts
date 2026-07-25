import { OrderLifecycleStatus } from './order-lifecycle-status.enum';
import { IllegalOrderLifecycleTransitionException } from '../exceptions/illegal-order-lifecycle-transition.exception';

const TERMINAL_STATUSES: ReadonlySet<OrderLifecycleStatus> = new Set([
  OrderLifecycleStatus.CANCELLED,
  OrderLifecycleStatus.REJECTED,
  OrderLifecycleStatus.FAILED,
  OrderLifecycleStatus.COMPLETED,
]);

const TRANSITION_TABLE: ReadonlyMap<
  OrderLifecycleStatus,
  ReadonlySet<OrderLifecycleStatus>
> = new Map([
  [
    OrderLifecycleStatus.CREATED,
    new Set([OrderLifecycleStatus.VALIDATED, OrderLifecycleStatus.FAILED]),
  ],
  [
    OrderLifecycleStatus.VALIDATED,
    new Set([
      OrderLifecycleStatus.QUEUED,
      OrderLifecycleStatus.REJECTED,
      OrderLifecycleStatus.FAILED,
    ]),
  ],
  [
    OrderLifecycleStatus.QUEUED,
    new Set([
      OrderLifecycleStatus.SUBMITTED,
      OrderLifecycleStatus.CANCELLED,
      OrderLifecycleStatus.FAILED,
    ]),
  ],
  [
    OrderLifecycleStatus.SUBMITTED,
    new Set([
      OrderLifecycleStatus.PENDING,
      OrderLifecycleStatus.PARTIALLY_FILLED,
      OrderLifecycleStatus.FILLED,
      OrderLifecycleStatus.REJECTED,
      OrderLifecycleStatus.FAILED,
    ]),
  ],
  [
    OrderLifecycleStatus.PENDING,
    new Set([
      OrderLifecycleStatus.PARTIALLY_FILLED,
      OrderLifecycleStatus.FILLED,
      OrderLifecycleStatus.MODIFY_PENDING,
      OrderLifecycleStatus.CANCEL_PENDING,
      OrderLifecycleStatus.REJECTED,
      OrderLifecycleStatus.FAILED,
    ]),
  ],
  [
    OrderLifecycleStatus.PARTIALLY_FILLED,
    new Set([
      OrderLifecycleStatus.FILLED,
      OrderLifecycleStatus.MODIFY_PENDING,
      OrderLifecycleStatus.CANCEL_PENDING,
      OrderLifecycleStatus.FAILED,
    ]),
  ],
  [
    OrderLifecycleStatus.MODIFY_PENDING,
    new Set([
      OrderLifecycleStatus.MODIFIED,
      OrderLifecycleStatus.PENDING,
      OrderLifecycleStatus.FAILED,
    ]),
  ],
  [
    OrderLifecycleStatus.MODIFIED,
    new Set([
      OrderLifecycleStatus.PENDING,
      OrderLifecycleStatus.PARTIALLY_FILLED,
      OrderLifecycleStatus.FILLED,
      OrderLifecycleStatus.CANCEL_PENDING,
      OrderLifecycleStatus.FAILED,
    ]),
  ],
  [
    OrderLifecycleStatus.CANCEL_PENDING,
    new Set([OrderLifecycleStatus.CANCELLED, OrderLifecycleStatus.FAILED]),
  ],
  [OrderLifecycleStatus.FILLED, new Set([OrderLifecycleStatus.COMPLETED])],
  [OrderLifecycleStatus.CANCELLED, new Set()],
  [OrderLifecycleStatus.REJECTED, new Set()],
  [OrderLifecycleStatus.FAILED, new Set()],
  [OrderLifecycleStatus.COMPLETED, new Set()],
]);

/**
 * `from: null` means "no order-lifecycle currently tracked" — the starting
 * point for a fresh attempt (including a retried exit attempt after a prior
 * one was REJECTED/FAILED, since those are terminal and cannot be transitioned
 * out of directly).
 */
export const OrderLifecycleTransitions = {
  isTerminal(status: OrderLifecycleStatus): boolean {
    return TERMINAL_STATUSES.has(status);
  },

  canTransition(
    from: OrderLifecycleStatus | null,
    to: OrderLifecycleStatus,
  ): boolean {
    if (from === null) {
      return to === OrderLifecycleStatus.CREATED;
    }
    return TRANSITION_TABLE.get(from)?.has(to) ?? false;
  },

  assertTransition(
    from: OrderLifecycleStatus | null,
    to: OrderLifecycleStatus,
  ): void {
    if (!this.canTransition(from, to)) {
      throw new IllegalOrderLifecycleTransitionException(from, to);
    }
  },
};
