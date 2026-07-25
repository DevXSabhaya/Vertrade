import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/models/authenticated-user.model';
import type { QueueItemSnapshot } from '@modules/order-queue/models/queue-item-snapshot';
import { PaperTradingService } from '../paper-trading.service';

@Controller('paper/orders')
@UseGuards(JwtAuthGuard)
export class PaperOrdersController {
  constructor(private readonly paperTradingService: PaperTradingService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QueueItemSnapshot[]> {
    return this.paperTradingService.getOrders(user.userId);
  }
}
