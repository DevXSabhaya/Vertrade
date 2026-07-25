import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class UserNotFoundException extends BaseException {
  readonly code = 'USER_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
}
