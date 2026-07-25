import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class RecoveryAlreadyRunningException extends BaseException {
  readonly code = 'RECOVERY_ALREADY_RUNNING';
  readonly httpStatus = HttpStatus.CONFLICT;
}
