import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { InjectConnection } from '@nestjs/mongoose';
import { ConnectionStates, type Connection } from 'mongoose';
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
  /** Aggregated across every currently-active broker account session, deployment-wide — reported for visibility only. Trading mode is per-user now, so there is no single "is this deployment LIVE" gate to condition readiness on. */
  broker: HealthStatus;
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongooseConnection: Connection,
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
   * Readiness — "is the process ready to actually serve real traffic."
   * Trading mode is per-user now (each user independently chooses
   * Paper/Live and their own broker account), so there is no single
   * deployment-wide "is this deployment LIVE" signal left to gate
   * readiness on — broker health is reported here for visibility only.
   * Reads `BrokerHealthService`'s already-computed snapshot (published by
   * the Scheduler's on-demand health-check job) rather than triggering a
   * new broker health check synchronously on every readiness probe.
   */
  @Get('ready')
  ready(@Res() res: Response): void {
    const databaseConnected = this.isDatabaseConnected();
    const brokerStatus = this.brokerHealthService.getSnapshot().overallStatus;
    const ready = databaseConnected;

    const body: ReadinessResponseBody = {
      status: ready ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      database: databaseConnected ? 'connected' : 'disconnected',
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
