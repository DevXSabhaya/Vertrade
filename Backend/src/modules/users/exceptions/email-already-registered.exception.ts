import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class EmailAlreadyRegisteredException extends BaseException {
  readonly code = 'EMAIL_ALREADY_REGISTERED';
  readonly httpStatus = HttpStatus.CONFLICT;
}
