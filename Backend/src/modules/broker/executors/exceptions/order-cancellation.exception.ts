import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class OrderCancellationException extends BaseException {
  readonly code = 'ORDER_CANCELLATION_FAILED';
  readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;
}
