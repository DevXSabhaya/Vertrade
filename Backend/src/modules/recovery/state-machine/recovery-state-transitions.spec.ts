import { RecoveryState } from '../models/recovery-state.enum';
import { RecoveryStateTransitions } from './recovery-state-transitions';
import { IllegalRecoveryStateTransitionException } from '../exceptions/illegal-recovery-state-transition.exception';

describe('RecoveryStateTransitions', () => {
  it('walks the full happy-path sequence in order', () => {
    const sequence = [
      RecoveryState.IDLE,
      RecoveryState.STARTING,
      RecoveryState.LOADING_CONFIG,
      RecoveryState.DATABASE_CONNECTED,
      RecoveryState.BROKER_AUTHENTICATING,
      RecoveryState.BROKER_CONNECTED,
      RecoveryState.MARKET_CONNECTED,
      RecoveryState.INSTRUMENT_LOADED,
      RecoveryState.ENGINE_RECOVERED,
      RecoveryState.TRADES_RECOVERED,
      RecoveryState.QUEUE_RECOVERED,
      RecoveryState.MONITORING_RECOVERED,
      RecoveryState.VERIFYING_POSITIONS,
      RecoveryState.COMPLETED,
    ];
    for (let i = 0; i < sequence.length - 1; i += 1) {
      expect(
        RecoveryStateTransitions.canTransition(sequence[i], sequence[i + 1]),
      ).toBe(true);
    }
  });

  it('allows every non-terminal state to transition to FAILED', () => {
    const nonTerminal = Object.values(RecoveryState).filter(
      (s) => s !== RecoveryState.COMPLETED && s !== RecoveryState.FAILED,
    );
    for (const state of nonTerminal) {
      expect(
        RecoveryStateTransitions.canTransition(state, RecoveryState.FAILED),
      ).toBe(true);
    }
  });

  it('rejects skipping a step', () => {
    expect(
      RecoveryStateTransitions.canTransition(
        RecoveryState.IDLE,
        RecoveryState.DATABASE_CONNECTED,
      ),
    ).toBe(false);
  });

  it('assertTransition throws IllegalRecoveryStateTransitionException on an illegal move', () => {
    expect(() =>
      RecoveryStateTransitions.assertTransition(
        RecoveryState.COMPLETED,
        RecoveryState.BROKER_CONNECTED,
      ),
    ).toThrow(IllegalRecoveryStateTransitionException);
  });

  it('marks COMPLETED and FAILED terminal, everything else non-terminal', () => {
    expect(RecoveryStateTransitions.isTerminal(RecoveryState.COMPLETED)).toBe(
      true,
    );
    expect(RecoveryStateTransitions.isTerminal(RecoveryState.FAILED)).toBe(
      true,
    );
    expect(RecoveryStateTransitions.isTerminal(RecoveryState.IDLE)).toBe(false);
  });

  it('FAILED can restart back to STARTING, and COMPLETED can return to IDLE', () => {
    expect(
      RecoveryStateTransitions.canTransition(
        RecoveryState.FAILED,
        RecoveryState.STARTING,
      ),
    ).toBe(true);
    expect(
      RecoveryStateTransitions.canTransition(
        RecoveryState.COMPLETED,
        RecoveryState.IDLE,
      ),
    ).toBe(true);
  });
});
