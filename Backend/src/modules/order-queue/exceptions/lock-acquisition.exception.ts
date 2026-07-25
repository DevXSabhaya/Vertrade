import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class LockAcquisitionException extends BaseException {
  readonly code = 'QUEUE_LOCK_ACQUISITION_FAILED';
  readonly httpStatus = HttpStatus.CONFLICT;
}
