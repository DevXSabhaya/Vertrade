import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ConnectionStates, type Connection } from 'mongoose';
import { HealthController } from './health.controller';

interface MockResponse {
  status: jest.Mock<MockResponse, [number]>;
  json: jest.Mock<MockResponse, [unknown]>;
}

function createMockResponse(): MockResponse {
  const response = {} as MockResponse;
  response.status = jest.fn<MockResponse, [number]>().mockReturnValue(response);
  response.json = jest.fn<MockResponse, [unknown]>().mockReturnValue(response);
  return response;
}

describe('HealthController', () => {
  it('returns 200 and status "ok" when the database is connected', () => {
    const connection = {
      readyState: ConnectionStates.connected,
    } as unknown as Connection;
    const controller = new HealthController(connection);
    const response = createMockResponse();

    controller.check(response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', database: 'connected' }),
    );
  });

  it('returns 503 and status "error" when the database is disconnected', () => {
    const connection = {
      readyState: ConnectionStates.disconnected,
    } as unknown as Connection;
    const controller = new HealthController(connection);
    const response = createMockResponse();

    controller.check(response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', database: 'disconnected' }),
    );
  });
});
