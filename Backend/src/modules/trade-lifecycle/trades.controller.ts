import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TradeManager } from './trade-manager.service';
import type { TradeRecord } from './models/trade-record.model';
import { ManualExitDto } from './dto/manual-exit.dto';
import { ForceExitDto } from './dto/force-exit.dto';

@Controller('trades')
export class TradesController {
  constructor(private readonly tradeManager: TradeManager) {}

  // Registered before the `:id` route below — Nest matches routes in
  // declaration order, and `active`/`history` would otherwise be captured
  // as a trade id by the wildcard route.
  @Get('active')
  async getActive(): Promise<TradeRecord[]> {
    return this.tradeManager.getActiveTrades();
  }

  @Get('history')
  async getHistory(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<TradeRecord[]> {
    return this.tradeManager.getHistory(
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined,
    );
  }

  @Post('manual-exit')
  async manualExit(@Body() dto: ManualExitDto): Promise<TradeRecord> {
    return this.tradeManager.manualExit(dto.tradeId);
  }

  @Post('force-exit')
  async forceExit(@Body() dto: ForceExitDto): Promise<TradeRecord> {
    return this.tradeManager.forceExit(dto.tradeId);
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<TradeRecord> {
    return this.tradeManager.getTrade(id);
  }

  @Get()
  async getAll(): Promise<TradeRecord[]> {
    return this.tradeManager.getAllTrades();
  }
}
