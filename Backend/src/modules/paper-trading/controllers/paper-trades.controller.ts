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
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/models/authenticated-user.model';
import { PaperTradingService } from '../paper-trading.service';
import { CreatePaperTradeDto } from '../dto/create-paper-trade.dto';
import { GetTradeHistoryQueryDto } from '../dto/get-trade-history-query.dto';
import type { PaperTradeView } from '../models/paper-trade-view.model';

/**
 * Phase 12, Part 4/5. Mounted at `/paper/trades` rather than the existing
 * global, unauthenticated `/trades` (`TradesController`, Phase 10) — that
 * controller lists every trade in the system for operational/ops use and is
 * left untouched; this one is the authenticated, per-user product surface,
 * so the two paths never collide and neither had to be rewritten.
 */
@Controller('paper/trades')
@UseGuards(JwtAuthGuard)
export class PaperTradesController {
  constructor(private readonly paperTradingService: PaperTradingService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaperTradeDto,
  ): Promise<PaperTradeView> {
    return this.paperTradingService.createTrade(user.userId, dto);
  }

  @Get('active')
  async active(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaperTradeView[]> {
    return this.paperTradingService.getActiveTrades(user.userId);
  }

  @Get('history')
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetTradeHistoryQueryDto,
  ): Promise<PaperTradeView[]> {
    return this.paperTradingService.getHistory(
      user.userId,
      query.limit,
      query.offset,
      {
        status: query.status,
        side: query.side,
        instrument: query.instrument,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      },
    );
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<PaperTradeView> {
    return this.paperTradingService.getTrade(user.userId, id);
  }

  @Post(':id/exit')
  async exit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<PaperTradeView> {
    return this.paperTradingService.exitTrade(user.userId, id);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<PaperTradeView> {
    return this.paperTradingService.cancelTrade(user.userId, id);
  }
}
