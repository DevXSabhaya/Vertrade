import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

/** A broker (Angel One, or a future broker adapter) call failed or was rejected. */
export class BrokerException extends BaseException {
  readonly code = 'BROKER_ERROR';
  readonly httpStatus = HttpStatus.BAD_GATEWAY;
}
