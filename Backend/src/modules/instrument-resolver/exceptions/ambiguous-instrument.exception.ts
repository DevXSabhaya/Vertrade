import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class AmbiguousInstrumentException extends BaseException {
  readonly code = 'INSTRUMENT_AMBIGUOUS';
  readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;
}
