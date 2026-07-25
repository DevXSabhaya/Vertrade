import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class OrderNotFoundException extends BaseException {
  readonly code = 'ORDER_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
}
