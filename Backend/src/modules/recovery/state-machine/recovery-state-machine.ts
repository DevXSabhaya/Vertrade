import { RecoveryState } from '../models/recovery-state.enum';
import { RecoveryStateTransitions } from './recovery-state-transitions';

/**
 * Owns nothing but the current RecoveryState and transition validation
 * (Part 3 of the Phase 9 spec) — a dedicated, stateful collaborator injected
 * into RecoveryCoordinator, mirroring how Trade/QueueItem each own their own
 * transition table rather than the orchestrator validating transitions
 * inline.
 */
export class RecoveryStateMachine {
  private _state: RecoveryState = RecoveryState.IDLE;

  get state(): RecoveryState {
    return this._state;
  }

  transitionTo(next: RecoveryState): void {
    RecoveryStateTransitions.assertTransition(this._state, next);
    this._state = next;
  }

  isTerminal(): boolean {
    return RecoveryStateTransitions.isTerminal(this._state);
  }

  /** Resets back to IDLE — only valid once a run has reached a terminal state (COMPLETED/FAILED), or is already IDLE. */
  reset(): void {
    if (this._state === RecoveryState.IDLE) {
      return;
    }
    RecoveryStateTransitions.assertTransition(this._state, RecoveryState.IDLE);
    this._state = RecoveryState.IDLE;
  }
}
