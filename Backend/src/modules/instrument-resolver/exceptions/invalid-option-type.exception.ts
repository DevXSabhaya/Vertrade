import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class InvalidOptionTypeException extends BaseException {
  readonly code = 'INSTRUMENT_INVALID_OPTION_TYPE';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
}
