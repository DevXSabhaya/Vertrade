import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class TradeRecordNotFoundException extends BaseException {
  readonly code = 'TRADE_RECORD_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
}
