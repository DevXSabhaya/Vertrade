import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class RecoverySnapshotNotFoundException extends BaseException {
  readonly code = 'RECOVERY_SNAPSHOT_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
}
