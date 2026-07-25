import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class InvalidStrikeException extends BaseException {
  readonly code = 'INSTRUMENT_INVALID_STRIKE';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
}
