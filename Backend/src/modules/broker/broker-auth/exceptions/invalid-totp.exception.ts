import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class InvalidTotpException extends BaseException {
  readonly code = 'BROKER_INVALID_TOTP';
  readonly httpStatus = HttpStatus.UNAUTHORIZED;
}
