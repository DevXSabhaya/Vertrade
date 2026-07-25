import { TradeState } from './trade-state.enum';
import { IllegalTradeStateTransitionException } from '../exceptions/illegal-trade-state-transition.exception';

const TERMINAL_STATES: ReadonlySet<TradeState> = new Set([
  TradeState.COMPLETED,
  TradeState.CANCELLED,
  TradeState.REJECTED,
  TradeState.FAILED,
  TradeState.ERROR,
]);

const BASE_TRANSITIONS: ReadonlyMap<
  TradeState,
  ReadonlySet<TradeState>
> = new Map([
  [
    TradeState.DRAFT,
    new Set([
      TradeState.WAITING_ENTRY,
      TradeState.CANCELLED,
      TradeState.REJECTED,
    ]),
  ],
  [
    TradeState.WAITING_ENTRY,
    new Set([TradeState.ENTRY_PENDING, TradeState.CANCELLED]),
  ],
  [
    TradeState.ENTRY_PENDING,
    new Set([
      TradeState.ENTRY_FILLED,
      TradeState.REJECTED,
      TradeState.FAILED,
      TradeState.CANCELLED,
    ]),
  ],
  [TradeState.ENTRY_FILLED, new Set([TradeState.ACTIVE])],
  [TradeState.ACTIVE, new Set([TradeState.TARGET_HIT, TradeState.COMPLETED])],
  [TradeState.TARGET_HIT, new Set([TradeState.TRAILING_SL_UPDATED])],
  [TradeState.TRAILING_SL_UPDATED, new Set([TradeState.ACTIVE])],
  [
    TradeState.RECOVERY,
    new Set([
      TradeState.WAITING_ENTRY,
      TradeState.ENTRY_PENDING,
      TradeState.ACTIVE,
      TradeState.COMPLETED,
      TradeState.CANCELLED,
      TradeState.FAILED,
    ]),
  ],
  [TradeState.COMPLETED, new Set()],
  [TradeState.CANCELLED, new Set()],
  [TradeState.REJECTED, new Set()],
  [TradeState.FAILED, new Set()],
  [TradeState.ERROR, new Set()],
]);

/**
 * Every non-terminal state can additionally always move to RECOVERY (Startup
 * Recovery Service, a later phase, needs to be able to reattach to a trade in
 * any live state) and to ERROR (an unclassified engine-level fault). Adding
 * these once, here, keeps the base table above focused on normal business
 * flow instead of repeating the same two entries on every row.
 */
function buildTransitionTable(): ReadonlyMap<
  TradeState,
  ReadonlySet<TradeState>
> {
  const table = new Map<TradeState, Set<TradeState>>();
  for (const [state, next] of BASE_TRANSITIONS) {
    const allowed = new Set(next);
    if (!TERMINAL_STATES.has(state)) {
      allowed.add(TradeState.RECOVERY);
      allowed.add(TradeState.ERROR);
    }
    table.set(state, allowed);
  }
  return table;
}

const TRANSITION_TABLE = buildTransitionTable();

export const TradeStateTransitions = {
  isTerminal(state: TradeState): boolean {
    return TERMINAL_STATES.has(state);
  },

  canTransition(from: TradeState, to: TradeState): boolean {
    return TRANSITION_TABLE.get(from)?.has(to) ?? false;
  },

  assertTransition(from: TradeState, to: TradeState): void {
    if (!this.canTransition(from, to)) {
      throw new IllegalTradeStateTransitionException(from, to);
    }
  },
};
