import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';
import type { QueueItemState } from '../models/queue-item-state.enum';

export class IllegalQueueItemTransitionException extends BaseException {
  readonly code = 'QUEUE_ITEM_ILLEGAL_TRANSITION';
  readonly httpStatus = HttpStatus.CONFLICT;

  constructor(from: QueueItemState, to: QueueItemState) {
    super(`Illegal queue item state transition: ${from} -> ${to}`, {
      from,
      to,
    });
  }
}
