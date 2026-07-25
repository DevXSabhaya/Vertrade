import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class BrokerSessionExpiredException extends BaseException {
  readonly code = 'BROKER_SESSION_EXPIRED';
  readonly httpStatus = HttpStatus.UNAUTHORIZED;
}
