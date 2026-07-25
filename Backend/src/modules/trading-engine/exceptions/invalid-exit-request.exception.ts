import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class InvalidExitRequestException extends BaseException {
  readonly code = 'INVALID_EXIT_REQUEST';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
}
