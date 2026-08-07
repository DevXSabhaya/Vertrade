import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@core/config/config.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/models/authenticated-user.model';
import { TradingModeService } from '@modules/trading-mode/trading-mode.service';
import { SetTradingModeDto } from './dto/set-trading-mode.dto';

interface TradingModeResponseBody {
  readonly tradingMode: 'PAPER' | 'LIVE';
  /** The env-configured (`TRADING_MODE`) boot-time default — surfaced so the UI can show when the persisted mode has been overridden away from it. */
  readonly defaultTradingMode: 'PAPER' | 'LIVE';
}

/**
 * `trading-mode` is public/unauthenticated (mirrors `/health`) — never
 * exposes credentials or secrets, only the operational mode selector that
 * determines which `IOrderExecutor` every trade in this deployment currently
 * runs through. Exists specifically so the frontend can show the user which
 * mode is active *before* they submit a trade, never inferring it
 * client-side.
 *
 * Broker connection status/session management lives entirely under
 * `/broker-accounts` (`BrokerAccountController`) — a per-user, ownership-scoped
 * model. This controller deliberately never surfaces broker session identity,
 * client codes, or balances: an earlier `/config/broker-status` /
 * `/config/broker-account-summary` surface here reflected a single
 * deployment-wide broker session to *any* authenticated user with no
 * ownership check, which is exactly the kind of developer-credential leak
 * the per-account model exists to prevent. Removed rather than patched.
 */
@Controller('config')
export class AppConfigController {
  constructor(
    private readonly configService: ConfigService,
    private readonly tradingModeService: TradingModeService,
  ) {}

  @Get('trading-mode')
  getTradingMode(): TradingModeResponseBody {
    return {
      tradingMode: this.tradingModeService.getCurrentMode(),
      defaultTradingMode: this.configService.tradingMode,
    };
  }

  /**
   * Switches the deployment's persisted trading mode via
   * `TradingModeService.setMode` — every safety check (LIVE readiness,
   * broker credentials, live session) lives there and is never duplicated
   * here. Only affects trades created *after* this call; any trade already
   * in flight keeps the executor it was pinned to at creation (see
   * `Trade.mode` / `TradingEngineService.executorFor`). Authenticated only
   * (no separate role system exists in this codebase yet — see
   * `AuthenticatedUser`), and failures (e.g. no broker credentials, broker
   * session couldn't be established) propagate as-is through the global
   * exception filter so the UI can show the caller exactly why the switch
   * was refused.
   */
  @Post('trading-mode')
  @UseGuards(JwtAuthGuard)
  async setTradingMode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetTradingModeDto,
  ): Promise<TradingModeResponseBody> {
    await this.tradingModeService.setMode(dto.mode, user.email);
    return this.getTradingMode();
  }
}
