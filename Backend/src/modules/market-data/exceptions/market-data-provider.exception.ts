import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class MarketDataProviderException extends BaseException {
  readonly code = 'MARKET_DATA_PROVIDER_ERROR';
  readonly httpStatus = HttpStatus.BAD_GATEWAY;
}
