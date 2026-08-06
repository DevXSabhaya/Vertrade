import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/models/authenticated-user.model';
import type { NetPosition } from '@modules/trade-lifecycle/models/net-position.model';
import { PaperTradingService } from '../paper-trading.service';
import type { PaperTradeView } from '../models/paper-trade-view.model';

/**
 * A "position" in this system is the same underlying entity as a paper
 * trade — there is no separate positions collection — so `:id`/`:id/exit`
 * here deliberately delegate to the exact same `PaperTradingService`
 * methods `PaperTradesController` uses (`getTrade`/`exitTrade`, both
 * already ownership-checked via `requireOwned`), rather than duplicating
 * that logic under a second name.
 */
@Controller('paper/positions')
@UseGuards(JwtAuthGuard)
export class PaperPositionsController {
  constructor(private readonly paperTradingService: PaperTradingService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaperTradeView[]> {
    return this.paperTradingService.getActiveTrades(user.userId);
  }

  /** Registered before `:id` so `/net` is never swallowed by the id-param route. */
  @Get('net')
  async netPositions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NetPosition[]> {
    return this.paperTradingService.getNetPositions(user.userId);
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
}
