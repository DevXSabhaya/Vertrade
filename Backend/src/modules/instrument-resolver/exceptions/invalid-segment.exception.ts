import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class InvalidSegmentException extends BaseException {
  readonly code = 'INSTRUMENT_INVALID_SEGMENT';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
}
