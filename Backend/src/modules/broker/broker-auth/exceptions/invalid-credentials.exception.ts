import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class InvalidCredentialsException extends BaseException {
  readonly code = 'BROKER_INVALID_CREDENTIALS';
  readonly httpStatus = HttpStatus.UNAUTHORIZED;
}
