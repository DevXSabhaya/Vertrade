import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

/** Thrown when an explicit `expiry` was supplied but no contract for that underlying/strike/optionType exists at exactly that expiry. */
export class ExpiryNotAvailableException extends BaseException {
  readonly code = 'INSTRUMENT_EXPIRY_NOT_AVAILABLE';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
}
