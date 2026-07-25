import type { RecoveryStep } from './recovery-step.enum';

export interface RecoveryErrorRecord {
  readonly id: string;
  readonly recoveryId: string;
  readonly occurredAt: string;
  readonly step: RecoveryStep;
  readonly message: string;
  readonly attempt: number;
}
