import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class PaperTradeNotFoundException extends BaseException {
  readonly code = 'PAPER_TRADE_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
}
