import { Controller, Get } from '@nestjs/common';
import { PositionManager } from './position-manager.service';
import type { TradeRecord } from './models/trade-record.model';

@Controller('positions')
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
