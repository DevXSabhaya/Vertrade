import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class DuplicateInstrumentException extends BaseException {
  readonly code = 'INSTRUMENT_DUPLICATE';
  readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;
}
