import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/models/authenticated-user.model';
import { TradingModeService } from '@modules/trading-mode/trading-mode.service';
import { SetTradingModeDto } from './dto/set-trading-mode.dto';
import { SelectBrokerDto } from './dto/select-broker.dto';

interface TradingModeResponseBody {
  readonly tradingMode: 'PAPER' | 'LIVE';
  readonly selectedBrokerAccountId: string | null;
}

/**
 * Trading mode (and which broker account executes a user's Live trades) is
 * per-user state — every route here is authenticated and reads/writes only
 * the caller's own `TradingModeService` preference. This controller never
 * surfaces broker session identity, client codes, or balances: broker
 * connection status/session management lives entirely under
 * `/broker-accounts` (`BrokerAccountController`), the single,
 * ownership-scoped location for that.
 */
@Controller('config')
@UseGuards(JwtAuthGuard)
export class AppConfigController {
  constructor(private readonly tradingModeService: TradingModeService) {}

  @Get('trading-mode')
  async getTradingMode(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TradingModeResponseBody> {
    const preference = await this.tradingModeService.getPreference(user.userId);
    return {
      tradingMode: preference.tradingMode,
      selectedBrokerAccountId: preference.selectedBrokerAccountId,
    };
  }

  /**
   * Switches the caller's own persisted trading mode via
   * `TradingModeService.setMode` — every safety check (LIVE readiness,
   * broker ownership, broker credentials, live session for the selected
   * account) lives there and is never duplicated here. Switching to LIVE
   * requires `brokerAccountId` in the body; failures (no broker connected,
   * invalid/expired credentials for the selected account) propagate as-is
   * through the global exception filter so the UI can show the caller
   * exactly why the switch was refused.
   */
  @Post('trading-mode')
  async setTradingMode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetTradingModeDto,
  ): Promise<TradingModeResponseBody> {
    await this.tradingModeService.setMode(
      user.userId,
      dto.mode,
      user.email,
      dto.brokerAccountId,
    );
    return this.getTradingMode(user);
  }

  /**
   * "Change Broker" — stays in LIVE, switches which of the caller's own
   * broker accounts executes their trades. Runs the same real
   * authentication check as switching into LIVE for the first time.
   */
  @Post('trading-mode/broker')
  async selectBroker(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SelectBrokerDto,
  ): Promise<TradingModeResponseBody> {
    await this.tradingModeService.setSelectedBroker(
      user.userId,
      dto.brokerAccountId,
      user.email,
    );
    return this.getTradingMode(user);
  }
}
