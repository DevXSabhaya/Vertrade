import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { TradeManager } from './trade-manager.service';
import type { TradeRecord } from './models/trade-record.model';
import { ManualExitDto } from './dto/manual-exit.dto';
import { ForceExitDto } from './dto/force-exit.dto';

/**
 * Global, platform-wide (not per-user) operational view — every trade in
 * the system, regardless of owner. Requires authentication like every
 * other endpoint, but there is no role/permission system in this codebase
 * yet, so this is "any authenticated user" rather than "admin only"; the
 * per-user product surface (`/paper/trades/*`) is the one regular users
 * should use, and already enforces ownership via `PaperTradeOwnershipService`.
 */
@Controller('trades')
@UseGuards(JwtAuthGuard)
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
