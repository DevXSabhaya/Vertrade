import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoggerService } from '@core/logger/logger.service';
import { BaseException } from '@common/exceptions/base.exception';

interface ErrorResponseBody {
  statusCode: number;
  timestamp: string;
  path: string;
  message: string | string[];
  code?: string;
  correlationId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let message: string | string[];
    let code: string | undefined;
    let correlationId: string | undefined;

    if (exception instanceof BaseException) {
      statusCode = exception.httpStatus;
      message = exception.message;
      code = exception.code;
      correlationId = exception.correlationId;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      message = this.extractMessage(exception);
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
    }

    const body: ErrorResponseBody = {
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      ...(code ? { code } : {}),
      ...(correlationId ? { correlationId } : {}),
    };

    this.logger.error(
      `${request.method} ${request.url} -> ${statusCode}: ${JSON.stringify(message)}`,
      exception instanceof Error ? exception.stack : undefined,
      'GlobalExceptionFilter',
    );

    response.status(statusCode).json(body);
  }

  private extractMessage(exception: HttpException): string | string[] {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (
      typeof response === 'object' &&
      response !== null &&
      'message' in response
    ) {
      const message = response.message;
      if (typeof message === 'string' || Array.isArray(message)) {
        return message;
      }
    }

    return exception.message;
  }
}
