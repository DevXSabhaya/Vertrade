import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class InstrumentMasterDownloadException extends BaseException {
  readonly code = 'INSTRUMENT_MASTER_DOWNLOAD_FAILED';
  readonly httpStatus = HttpStatus.BAD_GATEWAY;
}
