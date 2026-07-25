import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/models/authenticated-user.model';
import { PaperTradingService, type PnlSummary } from '../paper-trading.service';

@Controller('paper/pnl')
@UseGuards(JwtAuthGuard)
export class PaperPnlController {
  constructor(private readonly paperTradingService: PaperTradingService) {}

  @Get()
  async summary(@CurrentUser() user: AuthenticatedUser): Promise<PnlSummary> {
    return this.paperTradingService.getPnlSummary(user.userId);
  }
}
