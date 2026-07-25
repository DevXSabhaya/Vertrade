import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class BrokerNetworkException extends BaseException {
  readonly code = 'BROKER_NETWORK_FAILURE';
  readonly httpStatus = HttpStatus.BAD_GATEWAY;
}
