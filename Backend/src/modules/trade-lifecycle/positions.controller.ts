import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PositionManager } from './position-manager.service';
import type { TradeRecord } from './models/trade-record.model';

/** Global, platform-wide (not per-user) operational view — see TradesController for the same rationale. */
@Controller('positions')
@UseGuards(JwtAuthGuard)
export class PositionsController {
  constructor(private readonly positionManager: PositionManager) {}

  @Get('active')
  async getActive(): Promise<TradeRecord[]> {
    return this.positionManager.getActivePositions();
  }

  @Get()
  async getAll(): Promise<TradeRecord[]> {
    return this.positionManager.getAllPositions();
  }
}
