import { OrderLifecycleStatus } from './order-lifecycle-status.enum';
import { OrderLifecycleTransitions } from './order-lifecycle-transitions';
import { IllegalOrderLifecycleTransitionException } from '../exceptions/illegal-order-lifecycle-transition.exception';

describe('OrderLifecycleTransitions', () => {
  it('allows the full happy-path submission flow', () => {
    expect(
      OrderLifecycleTransitions.canTransition(
        null,
        OrderLifecycleStatus.CREATED,
      ),
    ).toBe(true);
    expect(
      OrderLifecycleTransitions.canTransition(
        OrderLifecycleStatus.CREATED,
        OrderLifecycleStatus.VALIDATED,
      ),
    ).toBe(true);
    expect(
      OrderLifecycleTransitions.canTransition(
        OrderLifecycleStatus.VALIDATED,
        OrderLifecycleStatus.QUEUED,
      ),
    ).toBe(true);
    expect(
      OrderLifecycleTransitions.canTransition(
        OrderLifecycleStatus.QUEUED,
        OrderLifecycleStatus.SUBMITTED,
      ),
    ).toBe(true);
    expect(
      OrderLifecycleTransitions.canTransition(
        OrderLifecycleStatus.SUBMITTED,
        OrderLifecycleStatus.FILLED,
      ),
    ).toBe(true);
    expect(
      OrderLifecycleTransitions.canTransition(
        OrderLifecycleStatus.FILLED,
        OrderLifecycleStatus.COMPLETED,
      ),
    ).toBe(true);
  });

  it('allows modify and cancel sub-flows from PENDING', () => {
    expect(
      OrderLifecycleTransitions.canTransition(
        OrderLifecycleStatus.PENDING,
        OrderLifecycleStatus.MODIFY_PENDING,
      ),
    ).toBe(true);
    expect(
      OrderLifecycleTransitions.canTransition(
        OrderLifecycleStatus.MODIFY_PENDING,
        OrderLifecycleStatus.MODIFIED,
      ),
    ).toBe(true);
    expect(
      OrderLifecycleTransitions.canTransition(
        OrderLifecycleStatus.PENDING,
        OrderLifecycleStatus.CANCEL_PENDING,
      ),
    ).toBe(true);
    expect(
      OrderLifecycleTransitions.canTransition(
        OrderLifecycleStatus.CANCEL_PENDING,
        OrderLifecycleStatus.CANCELLED,
      ),
    ).toBe(true);
  });

  it('rejects skipping straight from null to SUBMITTED', () => {
    expect(
      OrderLifecycleTransitions.canTransition(
        null,
        OrderLifecycleStatus.SUBMITTED,
      ),
    ).toBe(false);
  });

  it('treats CANCELLED, REJECTED, FAILED, COMPLETED as terminal', () => {
    for (const terminal of [
      OrderLifecycleStatus.CANCELLED,
      OrderLifecycleStatus.REJECTED,
      OrderLifecycleStatus.FAILED,
      OrderLifecycleStatus.COMPLETED,
    ]) {
      expect(OrderLifecycleTransitions.isTerminal(terminal)).toBe(true);
      expect(
        OrderLifecycleTransitions.canTransition(
          terminal,
          OrderLifecycleStatus.CREATED,
        ),
      ).toBe(false);
    }
  });

  it('assertTransition throws IllegalOrderLifecycleTransitionException for an illegal move', () => {
    expect(() =>
      OrderLifecycleTransitions.assertTransition(
        OrderLifecycleStatus.COMPLETED,
        OrderLifecycleStatus.CREATED,
      ),
    ).toThrow(IllegalOrderLifecycleTransitionException);
  });

  it('assertTransition does not throw for a legal move', () => {
    expect(() =>
      OrderLifecycleTransitions.assertTransition(
        null,
        OrderLifecycleStatus.CREATED,
      ),
    ).not.toThrow();
  });
});
