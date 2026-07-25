import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

/**
 * Thrown only when the account genuinely exists and the configured
 * `IEmailProvider` failed to send — an infrastructure error, never tied to
 * whether the email lookup succeeded, so it doesn't reveal anything about
 * account existence beyond what the generic 202 response already doesn't.
 */
export class EmailDeliveryFailedException extends BaseException {
  readonly code = 'EMAIL_DELIVERY_FAILED';
  readonly httpStatus = HttpStatus.BAD_GATEWAY;
}
