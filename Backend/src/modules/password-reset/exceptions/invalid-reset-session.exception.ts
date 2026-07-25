import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

/**
 * Thrown when `resetPassword` is called with a missing/wrong/expired/
 * already-used reset-session token — deliberately generic, same reasoning
 * as `InvalidResetCodeException`.
 */
export class InvalidResetSessionException extends BaseException {
  readonly code = 'INVALID_RESET_SESSION';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
}
