import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

/** Thrown when a broker id outside `BrokerId` (or simply not registered) is requested — should never happen from the frontend's own broker list, only from a malformed/stale request. */
export class UnknownBrokerException extends BaseException {
  readonly code = 'UNKNOWN_BROKER';
  readonly httpStatus = HttpStatus.NOT_FOUND;

  constructor(brokerId: string) {
    super(`Unknown broker: ${brokerId}`);
  }
}
