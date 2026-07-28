import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ConnectionStates, type Connection } from 'mongoose';
import type { TradingModeService } from '@modules/trading-mode/trading-mode.service';
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

function tradingModeService(mode: 'PAPER' | 'LIVE'): TradingModeService {
  return {
    getCurrentMode: () => mode,
  } as unknown as TradingModeService;
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
        tradingModeService('PAPER'),
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
        tradingModeService('PAPER'),
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

    it('liveness never depends on broker health, even in LIVE mode with a disconnected broker', () => {
      const controller = new HealthController(
        connection(ConnectionStates.connected),
        tradingModeService('LIVE'),
        brokerHealthService(HealthStatus.DISCONNECTED),
      );
      const response = createMockResponse();

      controller.check(response as unknown as Response);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
    });
  });

  describe('GET /health/ready (readiness)', () => {
    it('is ready in PAPER mode regardless of broker health — Paper never depends on a broker', () => {
      const controller = new HealthController(
        connection(ConnectionStates.connected),
        tradingModeService('PAPER'),
        brokerHealthService(HealthStatus.DISCONNECTED),
      );
      const response = createMockResponse();

      controller.ready(response as unknown as Response);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          tradingMode: 'PAPER',
          broker: HealthStatus.DISCONNECTED,
        }),
      );
    });

    it('is ready in LIVE mode only when broker health is HEALTHY', () => {
      const controller = new HealthController(
        connection(ConnectionStates.connected),
        tradingModeService('LIVE'),
        brokerHealthService(HealthStatus.HEALTHY),
      );
      const response = createMockResponse();

      controller.ready(response as unknown as Response);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ok', tradingMode: 'LIVE' }),
      );
    });

    it('is NOT ready in LIVE mode when broker health is not HEALTHY', () => {
      const controller = new HealthController(
        connection(ConnectionStates.connected),
        tradingModeService('LIVE'),
        brokerHealthService(HealthStatus.DEGRADED),
      );
      const response = createMockResponse();

      controller.ready(response as unknown as Response);

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          broker: HealthStatus.DEGRADED,
        }),
      );
    });

    it('is not ready when the database is disconnected, even in PAPER mode', () => {
      const controller = new HealthController(
        connection(ConnectionStates.disconnected),
        tradingModeService('PAPER'),
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
