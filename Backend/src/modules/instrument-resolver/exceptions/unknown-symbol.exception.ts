import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class UnknownSymbolException extends BaseException {
  readonly code = 'INSTRUMENT_UNKNOWN_SYMBOL';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
}
