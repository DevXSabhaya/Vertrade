import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class InstrumentMasterEmptyException extends BaseException {
  readonly code = 'INSTRUMENT_MASTER_EMPTY';
  readonly httpStatus = HttpStatus.BAD_GATEWAY;
}
