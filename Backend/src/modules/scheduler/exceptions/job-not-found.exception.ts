import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class JobNotFoundException extends BaseException {
  readonly code = 'SCHEDULER_JOB_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
}
