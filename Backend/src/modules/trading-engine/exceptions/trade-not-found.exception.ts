import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class TradeNotFoundException extends BaseException {
  readonly code = 'TRADE_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
}
