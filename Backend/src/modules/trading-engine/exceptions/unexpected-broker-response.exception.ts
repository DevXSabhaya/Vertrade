import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

/**
 * Thrown when an IOrderExecutor returns an OrderResponse status that is
 * structurally impossible for the call that produced it (e.g. an entry
 * placement responding CANCELLED or EXITED) — a broker/executor contract
 * violation the Engine cannot meaningfully recover from.
 */
export class UnexpectedBrokerResponseException extends BaseException {
  readonly code = 'TRADE_UNEXPECTED_BROKER_RESPONSE';
  readonly httpStatus = HttpStatus.BAD_GATEWAY;
}
