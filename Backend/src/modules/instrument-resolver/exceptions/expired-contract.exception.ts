import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class ExpiredContractException extends BaseException {
  readonly code = 'INSTRUMENT_EXPIRED_CONTRACT';
  readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;
}
