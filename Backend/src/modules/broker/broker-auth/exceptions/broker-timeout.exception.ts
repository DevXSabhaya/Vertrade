import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class BrokerTimeoutException extends BaseException {
  readonly code = 'BROKER_TIMEOUT';
  readonly httpStatus = HttpStatus.GATEWAY_TIMEOUT;
}
