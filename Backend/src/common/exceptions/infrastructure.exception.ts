import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

/** An underlying system (database, cache, filesystem) failed unexpectedly. */
export class InfrastructureException extends BaseException {
  readonly code = 'INFRASTRUCTURE_ERROR';
  readonly httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
}
