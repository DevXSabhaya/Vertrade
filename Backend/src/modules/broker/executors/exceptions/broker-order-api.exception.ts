import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

/** Transport-level failure (network, timeout, malformed response) talking to a broker's order API. */
export class BrokerOrderApiException extends BaseException {
  readonly code = 'BROKER_ORDER_API_ERROR';
  readonly httpStatus = HttpStatus.BAD_GATEWAY;
}
