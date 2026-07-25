import { Injectable } from '@nestjs/common';
import { CorrelationIdStore } from './correlation-id.store';

/**
 * DI-injectable accessor for the current request's correlation id.
 * Backed by CorrelationIdStore so it works identically whether called
 * from a request-scoped provider or a background event handler.
 */
@Injectable()
export class CorrelationIdService {
  getCorrelationId(): string | undefined {
    return CorrelationIdStore.getId();
  }
}
