import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';
import type { RecoveryState } from '../models/recovery-state.enum';

export class IllegalRecoveryStateTransitionException extends BaseException {
  readonly code = 'ILLEGAL_RECOVERY_STATE_TRANSITION';
  readonly httpStatus = HttpStatus.CONFLICT;

  constructor(from: RecoveryState, to: RecoveryState) {
    super(`Cannot transition recovery state from ${from} to ${to}`);
  }
}
