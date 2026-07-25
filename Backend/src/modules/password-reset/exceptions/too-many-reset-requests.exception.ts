import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class TooManyResetRequestsException extends BaseException {
  readonly code = 'TOO_MANY_RESET_REQUESTS';
  readonly httpStatus = HttpStatus.TOO_MANY_REQUESTS;
}
