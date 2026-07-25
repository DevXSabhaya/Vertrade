import { RecoveryStateMachine } from './recovery-state-machine';
import { RecoveryState } from '../models/recovery-state.enum';
import { IllegalRecoveryStateTransitionException } from '../exceptions/illegal-recovery-state-transition.exception';

describe('RecoveryStateMachine', () => {
  it('starts IDLE', () => {
    const machine = new RecoveryStateMachine();
    expect(machine.state).toBe(RecoveryState.IDLE);
  });

  it('transitionTo moves state forward when legal', () => {
    const machine = new RecoveryStateMachine();
    machine.transitionTo(RecoveryState.STARTING);
    expect(machine.state).toBe(RecoveryState.STARTING);
  });

  it('transitionTo throws on an illegal move', () => {
    const machine = new RecoveryStateMachine();
    expect(() => machine.transitionTo(RecoveryState.COMPLETED)).toThrow(
      IllegalRecoveryStateTransitionException,
    );
  });

  it('reset() is a no-op when already IDLE', () => {
    const machine = new RecoveryStateMachine();
    expect(() => machine.reset()).not.toThrow();
    expect(machine.state).toBe(RecoveryState.IDLE);
  });

  it('reset() succeeds from a terminal state', () => {
    const machine = new RecoveryStateMachine();
    machine.transitionTo(RecoveryState.STARTING);
    machine.transitionTo(RecoveryState.FAILED);
    machine.reset();
    expect(machine.state).toBe(RecoveryState.IDLE);
  });

  it('reset() throws from a non-terminal, non-IDLE state', () => {
    const machine = new RecoveryStateMachine();
    machine.transitionTo(RecoveryState.STARTING);
    expect(() => machine.reset()).toThrow(
      IllegalRecoveryStateTransitionException,
    );
  });

  it('isTerminal() reflects COMPLETED/FAILED', () => {
    const machine = new RecoveryStateMachine();
    machine.transitionTo(RecoveryState.STARTING);
    machine.transitionTo(RecoveryState.FAILED);
    expect(machine.isTerminal()).toBe(true);
  });
});
