import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/models/authenticated-user.model';
import { PaperAccountService } from '@modules/paper-account/paper-account.service';
import type { PaperAccount } from '@modules/paper-account/models/paper-account.model';
import { PaperTradingService, type PnlSummary } from '../paper-trading.service';
import { PaperAccountResetBlockedException } from '@modules/paper-account/exceptions/paper-account-reset-blocked.exception';

/** Phase 12, Parts 3/7/10. Every route reads `userId` only from the verified JWT via `@CurrentUser()` — never from a path/query/body parameter. */
@Controller('account')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(
    private readonly paperAccountService: PaperAccountService,
    private readonly paperTradingService: PaperTradingService,
  ) {}

  /**
   * The single, unified account view — includes unrealized/total P&L
   * (composed live from open positions via `PaperTradingService`, the same
   * computation `/paper/pnl` already exposes) alongside the persisted
   * balance figures, so the dashboard never needs a second request just to
   * show P&L next to the balance. `/paper/pnl` remains available as a
   * narrower, P&L-only view for callers that only need that.
   */
  @Get()
  async getAccount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PnlSummary> {
    return this.paperTradingService.getPnlSummary(user.userId);
  }

  @Get('summary')
  async getSummary(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PnlSummary> {
    return this.paperTradingService.getPnlSummary(user.userId);
  }

  @Post('reset-paper-balance')
  async resetPaperBalance(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaperAccount> {
    const hasOpenTrades = await this.paperTradingService.hasOpenTrades(
      user.userId,
    );
    if (hasOpenTrades) {
      throw new PaperAccountResetBlockedException(
        'Cannot reset the paper balance while trades are pending or open — exit or cancel them first',
      );
    }
    return this.paperAccountService.resetBalance(user.userId);
  }
}
