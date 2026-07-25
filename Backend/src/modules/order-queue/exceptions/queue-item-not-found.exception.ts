import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class QueueItemNotFoundException extends BaseException {
  readonly code = 'QUEUE_ITEM_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
}
