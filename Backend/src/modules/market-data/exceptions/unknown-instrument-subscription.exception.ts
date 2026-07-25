import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class UnknownInstrumentSubscriptionException extends BaseException {
  readonly code = 'MARKET_DATA_UNKNOWN_SUBSCRIPTION';
  readonly httpStatus = HttpStatus.NOT_FOUND;
}
