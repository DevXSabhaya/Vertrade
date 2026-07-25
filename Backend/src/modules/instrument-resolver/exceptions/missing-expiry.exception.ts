import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class MissingExpiryException extends BaseException {
  readonly code = 'INSTRUMENT_MISSING_EXPIRY';
  readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;
}
