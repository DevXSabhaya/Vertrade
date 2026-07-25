import { RecoveryState } from '../models/recovery-state.enum';
import { IllegalRecoveryStateTransitionException } from '../exceptions/illegal-recovery-state-transition.exception';

const TERMINAL_STATES: ReadonlySet<RecoveryState> = new Set([
  RecoveryState.COMPLETED,
  RecoveryState.FAILED,
]);

const BASE_TRANSITIONS: ReadonlyMap<
  RecoveryState,
  ReadonlySet<RecoveryState>
> = new Map<RecoveryState, ReadonlySet<RecoveryState>>([
  [RecoveryState.IDLE, new Set([RecoveryState.STARTING])],
  [RecoveryState.STARTING, new Set([RecoveryState.LOADING_CONFIG])],
  [RecoveryState.LOADING_CONFIG, new Set([RecoveryState.DATABASE_CONNECTED])],
  [
    RecoveryState.DATABASE_CONNECTED,
    new Set([RecoveryState.BROKER_AUTHENTICATING]),
  ],
  [
    RecoveryState.BROKER_AUTHENTICATING,
    new Set([RecoveryState.BROKER_CONNECTED]),
  ],
  [RecoveryState.BROKER_CONNECTED, new Set([RecoveryState.MARKET_CONNECTED])],
  [RecoveryState.MARKET_CONNECTED, new Set([RecoveryState.INSTRUMENT_LOADED])],
  [RecoveryState.INSTRUMENT_LOADED, new Set([RecoveryState.ENGINE_RECOVERED])],
  [RecoveryState.ENGINE_RECOVERED, new Set([RecoveryState.TRADES_RECOVERED])],
  [RecoveryState.TRADES_RECOVERED, new Set([RecoveryState.QUEUE_RECOVERED])],
  [
    RecoveryState.QUEUE_RECOVERED,
    new Set([RecoveryState.MONITORING_RECOVERED]),
  ],
  [
    RecoveryState.MONITORING_RECOVERED,
    new Set([RecoveryState.VERIFYING_POSITIONS]),
  ],
  [RecoveryState.VERIFYING_POSITIONS, new Set([RecoveryState.COMPLETED])],
  [RecoveryState.COMPLETED, new Set([RecoveryState.IDLE])],
  [RecoveryState.FAILED, new Set([RecoveryState.IDLE, RecoveryState.STARTING])],
]);

/** Every non-terminal state can also always move to FAILED — a step failing exhausts retries at any point in the flow. */
function buildTransitionTable(): ReadonlyMap<
  RecoveryState,
  ReadonlySet<RecoveryState>
> {
  const table = new Map<RecoveryState, Set<RecoveryState>>();
  for (const [state, next] of BASE_TRANSITIONS) {
    const allowed = new Set(next);
    if (!TERMINAL_STATES.has(state)) {
      allowed.add(RecoveryState.FAILED);
    }
    table.set(state, allowed);
  }
  return table;
}

const TRANSITION_TABLE = buildTransitionTable();

export const RecoveryStateTransitions = {
  isTerminal(state: RecoveryState): boolean {
    return TERMINAL_STATES.has(state);
  },

  canTransition(from: RecoveryState, to: RecoveryState): boolean {
    return TRANSITION_TABLE.get(from)?.has(to) ?? false;
  },

  assertTransition(from: RecoveryState, to: RecoveryState): void {
    if (!this.canTransition(from, to)) {
      throw new IllegalRecoveryStateTransitionException(from, to);
    }
  },
};
