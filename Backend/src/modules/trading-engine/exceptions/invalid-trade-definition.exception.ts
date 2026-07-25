import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class InvalidTradeDefinitionException extends BaseException {
  readonly code = 'TRADE_INVALID_DEFINITION';
  readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;
}
