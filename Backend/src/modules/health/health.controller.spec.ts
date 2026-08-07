import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ConnectionStates, type Connection } from 'mongoose';
import type { BrokerHealthService } from '@modules/broker-health/broker-health.service';
import { HealthStatus } from '@modules/broker-health/models/health-status.enum';
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

function connection(state: ConnectionStates): Connection {
  return { readyState: state } as unknown as Connection;
}

function brokerHealthService(overallStatus: HealthStatus): BrokerHealthService {
  return {
    getSnapshot: jest.fn().mockReturnValue({ overallStatus }),
  } as unknown as BrokerHealthService;
}

describe('HealthController', () => {
  describe('GET /health (liveness)', () => {
    it('returns 200 and status "ok" when the database is connected', () => {
      const controller = new HealthController(
        connection(ConnectionStates.connected),
        brokerHealthService(HealthStatus.UNKNOWN),
      );
      const response = createMockResponse();

      controller.check(response as unknown as Response);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ok', database: 'connected' }),
      );
    });

    it('returns 503 and status "error" when the database is disconnected', () => {
      const controller = new HealthController(
        connection(ConnectionStates.disconnected),
        brokerHealthService(HealthStatus.UNKNOWN),
      );
      const response = createMockResponse();

      controller.check(response as unknown as Response);

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error', database: 'disconnected' }),
      );
    });

    it('liveness never depends on broker health, even when the broker is disconnected', () => {
      const controller = new HealthController(
        connection(ConnectionStates.connected),
        brokerHealthService(HealthStatus.DISCONNECTED),
      );
      const response = createMockResponse();

      controller.check(response as unknown as Response);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
    });
  });

  describe('GET /health/ready (readiness)', () => {
    it('is ready regardless of broker health — broker status is reported for visibility only', () => {
      const controller = new HealthController(
        connection(ConnectionStates.connected),
        brokerHealthService(HealthStatus.DISCONNECTED),
      );
      const response = createMockResponse();

      controller.ready(response as unknown as Response);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          broker: HealthStatus.DISCONNECTED,
        }),
      );
    });

    it('reports broker health in the response body when healthy', () => {
      const controller = new HealthController(
        connection(ConnectionStates.connected),
        brokerHealthService(HealthStatus.HEALTHY),
      );
      const response = createMockResponse();

      controller.ready(response as unknown as Response);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ok', broker: HealthStatus.HEALTHY }),
      );
    });

    it('reports broker health in the response body when degraded, while remaining ready', () => {
      const controller = new HealthController(
        connection(ConnectionStates.connected),
        brokerHealthService(HealthStatus.DEGRADED),
      );
      const response = createMockResponse();

      controller.ready(response as unknown as Response);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          broker: HealthStatus.DEGRADED,
        }),
      );
    });

    it('is not ready when the database is disconnected, regardless of broker health', () => {
      const controller = new HealthController(
        connection(ConnectionStates.disconnected),
        brokerHealthService(HealthStatus.UNKNOWN),
      );
      const response = createMockResponse();

      controller.ready(response as unknown as Response);

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    });
  });
});
