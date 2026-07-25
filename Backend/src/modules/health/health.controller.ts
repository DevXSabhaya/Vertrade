import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { InjectConnection } from '@nestjs/mongoose';
import { ConnectionStates, type Connection } from 'mongoose';
import { ConfigService } from '@core/config/config.service';
import { BrokerHealthService } from '@modules/broker-health/broker-health.service';
import { HealthStatus } from '@modules/broker-health/models/health-status.enum';

interface HealthResponseBody {
  status: 'ok' | 'error';
  timestamp: string;
  database: 'connected' | 'disconnected';
}

interface ReadinessResponseBody {
  status: 'ok' | 'error';
  timestamp: string;
  database: 'connected' | 'disconnected';
  tradingMode: 'PAPER' | 'LIVE';
  /** Only meaningful (and only gates readiness) when tradingMode is LIVE — Paper mode never talks to a broker, so its health is reported for visibility only. */
  broker: HealthStatus;
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongooseConnection: Connection,
    private readonly configService: ConfigService,
    private readonly brokerHealthService: BrokerHealthService,
  ) {}

  /**
   * Liveness — "is the process up and able to serve requests at all."
   * Deliberately minimal and fast (DB connectivity only, unchanged from
   * before this Phase 20 hardening pass) so an orchestrator's liveness
   * probe never times out or restarts a healthy process just because a
   * downstream dependency (e.g. the broker) is degraded — that's what
   * `/health/ready` is for.
   */
  @Get()
  check(@Res() res: Response): void {
    const databaseConnected = this.isDatabaseConnected();

    const body: HealthResponseBody = {
      status: databaseConnected ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      database: databaseConnected ? 'connected' : 'disconnected',
    };

    res
      .status(
        databaseConnected ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
      )
      .json(body);
  }

  /**
   * Readiness — "is the process ready to actually serve real traffic,"
   * which additionally depends on broker health when `TRADING_MODE=LIVE`
   * (a live deployment with a disconnected/degraded broker is not truly
   * ready even though the process itself is alive and the database is
   * fine). In PAPER mode broker health can never gate readiness — Paper
   * trading has no broker dependency — but the last-known snapshot is
   * still reported for visibility. Reads `BrokerHealthService`'s
   * already-computed snapshot (published by the Scheduler's on-demand
   * health-check job) rather than triggering a new broker health check
   * synchronously on every readiness probe.
   */
  @Get('ready')
  ready(@Res() res: Response): void {
    const databaseConnected = this.isDatabaseConnected();
    const tradingMode = this.configService.tradingMode;
    const brokerStatus = this.brokerHealthService.getSnapshot().overallStatus;

    const brokerBlocksReadiness =
      tradingMode === 'LIVE' && brokerStatus !== HealthStatus.HEALTHY;
    const ready = databaseConnected && !brokerBlocksReadiness;

    const body: ReadinessResponseBody = {
      status: ready ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      database: databaseConnected ? 'connected' : 'disconnected',
      tradingMode,
      broker: brokerStatus,
    };

    res
      .status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json(body);
  }

  private isDatabaseConnected(): boolean {
    return this.mongooseConnection.readyState === ConnectionStates.connected;
  }
}
