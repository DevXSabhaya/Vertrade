import type { RecoveryState } from './recovery-state.enum';
import type { RecoveryStep } from './recovery-step.enum';

/** The read model served by GET /recovery/status. */
export interface RecoveryStatus {
  readonly state: RecoveryState;
  readonly currentStep: RecoveryStep | null;
  readonly isRunning: boolean;
  readonly startedAt: string | null;
  readonly lastCompletedAt: string | null;
  readonly lastError: string | null;
}
