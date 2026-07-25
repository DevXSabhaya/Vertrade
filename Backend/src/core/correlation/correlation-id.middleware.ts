import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { HEADERS } from '@shared/constants/headers.constant';
import { CorrelationId } from '@shared/value-objects/correlation-id.vo';
import { CorrelationIdStore } from './correlation-id.store';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(HEADERS.CORRELATION_ID);
    const correlationId = this.resolveCorrelationId(incoming);

    res.setHeader(HEADERS.CORRELATION_ID, correlationId);
    CorrelationIdStore.run(correlationId, () => next());
  }

  private resolveCorrelationId(incoming: string | undefined): string {
    if (!incoming) {
      return randomUUID();
    }

    const result = CorrelationId.create(incoming);
    return result.isSuccess ? result.value.toString() : randomUUID();
  }
}
