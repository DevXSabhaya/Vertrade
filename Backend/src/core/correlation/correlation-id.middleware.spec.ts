import type { NextFunction, Request, Response } from 'express';
import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { CorrelationIdStore } from './correlation-id.store';

describe('CorrelationIdMiddleware', () => {
  const middleware = new CorrelationIdMiddleware();

  function createRequest(headerValue?: string): Request {
    return {
      header: () => headerValue,
    } as unknown as Request;
  }

  function createResponse(): { setHeader: jest.Mock } & Response {
    return { setHeader: jest.fn() } as unknown as {
      setHeader: jest.Mock;
    } & Response;
  }

  it('generates a new correlation id when none is provided', () => {
    const req = createRequest(undefined);
    const res = createResponse();
    let observedId: string | undefined;
    const next: NextFunction = () => {
      observedId = CorrelationIdStore.getId();
    };

    middleware.use(req, res, next);

    expect(observedId).toBeDefined();
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', observedId);
  });

  it('reuses a valid incoming correlation id', () => {
    const incoming = 'client-supplied-correlation-id';
    const req = createRequest(incoming);
    const res = createResponse();
    let observedId: string | undefined;
    const next: NextFunction = () => {
      observedId = CorrelationIdStore.getId();
    };

    middleware.use(req, res, next);

    expect(observedId).toBe(incoming);
  });

  it('falls back to a generated id when the incoming header is malformed', () => {
    const req = createRequest('bad id!!');
    const res = createResponse();
    let observedId: string | undefined;
    const next: NextFunction = () => {
      observedId = CorrelationIdStore.getId();
    };

    middleware.use(req, res, next);

    expect(observedId).toBeDefined();
    expect(observedId).not.toBe('bad id!!');
  });
});
