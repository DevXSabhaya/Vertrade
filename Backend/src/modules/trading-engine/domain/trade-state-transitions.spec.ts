import { TradeState } from './trade-state.enum';
import { TradeStateTransitions } from './trade-state-transitions';
import { IllegalTradeStateTransitionException } from '../exceptions/illegal-trade-state-transition.exception';

describe('TradeStateTransitions', () => {
  it('allows the full happy-path entry flow', () => {
    expect(
      TradeStateTransitions.canTransition(
        TradeState.DRAFT,
        TradeState.WAITING_ENTRY,
      ),
    ).toBe(true);
    expect(
      TradeStateTransitions.canTransition(
        TradeState.WAITING_ENTRY,
        TradeState.ENTRY_PENDING,
      ),
    ).toBe(true);
    expect(
      TradeStateTransitions.canTransition(
        TradeState.ENTRY_PENDING,
        TradeState.ENTRY_FILLED,
      ),
    ).toBe(true);
    expect(
      TradeStateTransitions.canTransition(
        TradeState.ENTRY_FILLED,
        TradeState.ACTIVE,
      ),
    ).toBe(true);
  });

  it('allows the target/trailing loop back to ACTIVE', () => {
    expect(
      TradeStateTransitions.canTransition(
        TradeState.ACTIVE,
        TradeState.TARGET_HIT,
      ),
    ).toBe(true);
    expect(
      TradeStateTransitions.canTransition(
        TradeState.TARGET_HIT,
        TradeState.TRAILING_SL_UPDATED,
      ),
    ).toBe(true);
    expect(
      TradeStateTransitions.canTransition(
        TradeState.TRAILING_SL_UPDATED,
        TradeState.ACTIVE,
      ),
    ).toBe(true);
  });

  it('allows ACTIVE to complete directly (stop loss exit)', () => {
    expect(
      TradeStateTransitions.canTransition(
        TradeState.ACTIVE,
        TradeState.COMPLETED,
      ),
    ).toBe(true);
  });

  it('allows cancellation only pre-fill', () => {
    expect(
      TradeStateTransitions.canTransition(
        TradeState.DRAFT,
        TradeState.CANCELLED,
      ),
    ).toBe(true);
    expect(
      TradeStateTransitions.canTransition(
        TradeState.WAITING_ENTRY,
        TradeState.CANCELLED,
      ),
    ).toBe(true);
    expect(
      TradeStateTransitions.canTransition(
        TradeState.ENTRY_PENDING,
        TradeState.CANCELLED,
      ),
    ).toBe(true);
    expect(
      TradeStateTransitions.canTransition(
        TradeState.ACTIVE,
        TradeState.CANCELLED,
      ),
    ).toBe(false);
  });

  it('rejects illegal transitions such as DRAFT -> ACTIVE', () => {
    expect(
      TradeStateTransitions.canTransition(TradeState.DRAFT, TradeState.ACTIVE),
    ).toBe(false);
  });

  it('rejects transitions out of any terminal state', () => {
    for (const terminal of [
      TradeState.COMPLETED,
      TradeState.CANCELLED,
      TradeState.REJECTED,
      TradeState.FAILED,
      TradeState.ERROR,
    ]) {
      expect(TradeStateTransitions.isTerminal(terminal)).toBe(true);
      expect(
        TradeStateTransitions.canTransition(terminal, TradeState.ACTIVE),
      ).toBe(false);
    }
  });

  it('allows every non-terminal state to enter RECOVERY and ERROR', () => {
    const nonTerminal = [
      TradeState.DRAFT,
      TradeState.WAITING_ENTRY,
      TradeState.ENTRY_PENDING,
      TradeState.ENTRY_FILLED,
      TradeState.ACTIVE,
      TradeState.TARGET_HIT,
      TradeState.TRAILING_SL_UPDATED,
    ];
    for (const state of nonTerminal) {
      expect(
        TradeStateTransitions.canTransition(state, TradeState.RECOVERY),
      ).toBe(true);
      expect(TradeStateTransitions.canTransition(state, TradeState.ERROR)).toBe(
        true,
      );
    }
  });

  it('allows RECOVERY to resume into WAITING_ENTRY, ENTRY_PENDING, or ACTIVE', () => {
    expect(
      TradeStateTransitions.canTransition(
        TradeState.RECOVERY,
        TradeState.WAITING_ENTRY,
      ),
    ).toBe(true);
    expect(
      TradeStateTransitions.canTransition(
        TradeState.RECOVERY,
        TradeState.ENTRY_PENDING,
      ),
    ).toBe(true);
    expect(
      TradeStateTransitions.canTransition(
        TradeState.RECOVERY,
        TradeState.ACTIVE,
      ),
    ).toBe(true);
  });

  it('assertTransition throws IllegalTradeStateTransitionException for an illegal move', () => {
    expect(() =>
      TradeStateTransitions.assertTransition(
        TradeState.COMPLETED,
        TradeState.ACTIVE,
      ),
    ).toThrow(IllegalTradeStateTransitionException);
  });

  it('assertTransition does not throw for a legal move', () => {
    expect(() =>
      TradeStateTransitions.assertTransition(
        TradeState.DRAFT,
        TradeState.WAITING_ENTRY,
      ),
    ).not.toThrow();
  });
});
