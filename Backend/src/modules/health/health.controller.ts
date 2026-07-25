import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { InjectConnection } from '@nestjs/mongoose';
import { ConnectionStates, type Connection } from 'mongoose';

interface HealthResponseBody {
  status: 'ok' | 'error';
  timestamp: string;
  database: 'connected' | 'disconnected';
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongooseConnection: Connection,
  ) {}

  @Get()
  check(@Res() res: Response): void {
    const databaseConnected =
      this.mongooseConnection.readyState === ConnectionStates.connected;

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
}
