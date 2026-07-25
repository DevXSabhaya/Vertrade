import { HttpStatus } from '@nestjs/common';
import { CorrelationIdStore } from '@core/correlation/correlation-id.store';

/**
 * Every domain/infrastructure exception in the system extends this — never a
 * bare Error and never a direct HttpException — so the Global Exception Filter
 * can map any of them to a consistent, correlation-id-tagged response shape.
 */
export abstract class BaseException extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: HttpStatus;
  readonly timestamp: string;
  readonly correlationId?: string;
  readonly metadata?: Record<string, unknown>;

  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.correlationId = CorrelationIdStore.getId();
    this.metadata = metadata;
    Error.captureStackTrace(this, this.constructor);
  }
}
