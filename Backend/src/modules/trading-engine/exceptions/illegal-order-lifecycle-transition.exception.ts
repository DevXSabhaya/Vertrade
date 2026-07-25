import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';
import type { OrderLifecycleStatus } from '../domain/order-lifecycle-status.enum';

export class IllegalOrderLifecycleTransitionException extends BaseException {
  readonly code = 'ORDER_LIFECYCLE_ILLEGAL_TRANSITION';
  readonly httpStatus = HttpStatus.CONFLICT;

  constructor(from: OrderLifecycleStatus | null, to: OrderLifecycleStatus) {
    super(`Illegal order lifecycle transition: ${from ?? 'NONE'} -> ${to}`, {
      from,
      to,
    });
  }
}
