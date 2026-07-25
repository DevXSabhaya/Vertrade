import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { BusinessException } from '@common/exceptions/business.exception';
import { LoggerService } from '@core/logger/logger.service';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let logger: LoggerService;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    logger = new LoggerService();
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    filter = new GlobalExceptionFilter(logger);

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({ method: 'GET', url: '/test' }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('maps a BaseException using its own httpStatus, code, and correlationId', () => {
    const exception = new BusinessException('rule violated');

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'rule violated',
        code: 'BUSINESS_RULE_VIOLATION',
      }),
    );
  });

  it('still maps a plain Nest HttpException the same way it did before Phase 1', () => {
    const exception = new BadRequestException('bad input');

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'bad input',
      }),
    );
  });

  it('still falls back to 500 for an unrecognized thrown value', () => {
    filter.catch(new Error('unexpected'), host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      }),
    );
  });
});
