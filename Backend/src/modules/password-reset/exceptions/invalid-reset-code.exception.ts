import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

/**
 * Deliberately identical whether the code is wrong, expired, already used, or
 * the email doesn't exist at all — never lets a caller distinguish those
 * cases (would otherwise leak account existence or remaining-attempts state).
 */
export class InvalidResetCodeException extends BaseException {
  readonly code = 'INVALID_RESET_CODE';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
}
