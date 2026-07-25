import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class OrderPlacementException extends BaseException {
  readonly code = 'ORDER_PLACEMENT_FAILED';
  readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;
}
