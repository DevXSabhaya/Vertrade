import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class OrderModificationException extends BaseException {
  readonly code = 'ORDER_MODIFICATION_FAILED';
  readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;
}
