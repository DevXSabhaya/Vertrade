import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@core/config/config.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/models/authenticated-user.model';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { BROKER_NAME_DHAN } from '@modules/broker/broker-auth/broker-auth.constants';
import {
  DhanAccountService,
  type BrokerAccountSummary,
} from '@modules/broker/broker-auth/dhan-account.service';
import { BrokerHealthService } from '@modules/broker-health/broker-health.service';
import { HealthStatus } from '@modules/broker-health/models/health-status.enum';
import { BusinessException } from '@common/exceptions/business.exception';
import { TradingModeService } from '@modules/trading-mode/trading-mode.service';
import { SetTradingModeDto } from './dto/set-trading-mode.dto';

interface TradingModeResponseBody {
  readonly tradingMode: 'PAPER' | 'LIVE';
  /** The env-configured (`TRADING_MODE`) boot-time default — surfaced so the UI can show when the persisted mode has been overridden away from it. */
  readonly defaultTradingMode: 'PAPER' | 'LIVE';
}

interface BrokerStatusResponseBody {
  readonly tradingMode: 'PAPER' | 'LIVE';
  readonly brokerName: string;
  /**
   * PAPER never talks to a broker at all — every field below reflects that
   * constant, safe state rather than a stale/misleading value carried over
   * from some other mode.
   */
  readonly connected: boolean;
  readonly authStatus: HealthStatus;
  readonly clientCode: string | null;
  /** Whether this broker's market-data feed is currently healthy — separate from order-execution capability, since one can be up while the other is degraded. */
  readonly marketDataCapability: HealthStatus;
  /** Whether this broker's order-placement REST API is currently healthy. */
  readonly orderExecutionCapability: HealthStatus;
  readonly lastSuccessfulConnectionAt: string | null;
  readonly lastHealthCheckAt: string | null;
}

interface BrokerAccountSummaryResponseBody extends BrokerAccountSummary {
  readonly supported: boolean;
  readonly reason: string | null;
}

/**
 * `trading-mode` is public/unauthenticated (mirrors `/health`) — never
 * exposes credentials or secrets, only the operational mode selector that
 * determines which `IOrderExecutor` every trade in this deployment currently
 * runs through. Exists specifically so the frontend can show the user which
 * mode is active *before* they submit a trade, never inferring it
 * client-side.
 *
 * `broker-status` is authenticated — it echoes the broker client code, which
 * while not a secret is still account-identifying — and gives the frontend
 * something to render a broker connect/status panel from without ever
 * exposing API keys/passwords/TOTP secrets (those are env-sourced only,
 * never entered or displayed anywhere in the UI).
 */
@Controller('config')
export class AppConfigController {
  constructor(
    private readonly configService: ConfigService,
    private readonly tradingModeService: TradingModeService,
    private readonly brokerSessionManager: BrokerSessionManager,
    private readonly brokerHealthService: BrokerHealthService,
    private readonly dhanAccountService: DhanAccountService,
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

  @Get('broker-status')
  @UseGuards(JwtAuthGuard)
  getBrokerStatus(): BrokerStatusResponseBody {
    const tradingMode = this.tradingModeService.getCurrentMode();
    if (tradingMode === 'PAPER') {
      return {
        tradingMode,
        brokerName: BROKER_NAME_DHAN,
        connected: false,
        authStatus: HealthStatus.UNKNOWN,
        clientCode: null,
        marketDataCapability: HealthStatus.UNKNOWN,
        orderExecutionCapability: HealthStatus.UNKNOWN,
        lastSuccessfulConnectionAt: null,
        lastHealthCheckAt: null,
      };
    }

    const session = this.brokerSessionManager.getActiveSession();
    const snapshot = this.brokerHealthService.getSnapshot();
    return {
      tradingMode,
      brokerName: BROKER_NAME_DHAN,
      connected: this.brokerSessionManager.isSessionValid(),
      authStatus: snapshot.authStatus,
      clientCode: session?.clientCode ?? null,
      marketDataCapability: snapshot.marketDataStatus,
      orderExecutionCapability: snapshot.restApiStatus,
      lastSuccessfulConnectionAt: snapshot.connectedSince,
      lastHealthCheckAt: snapshot.timestamp,
    };
  }

  /**
   * Triggers `BrokerSessionManager.ensureSession()` — logs in if there is no
   * session, or transparently refreshes an existing-but-stale one. Never
   * collects/accepts credentials in the request body: the broker credentials
   * this hits are always the ones already configured via env for this
   * deployment (see `BrokerCredentialsProvider`), matching the rest of this
   * codebase's "no broker secrets ever touch the UI" design. Login/refresh
   * failures (invalid credentials, invalid TOTP, network/timeout) propagate
   * as-is through the global exception filter — none of those exceptions
   * carry secret values.
   */
  @Post('broker/connect')
  @UseGuards(JwtAuthGuard)
  async connectBroker(): Promise<BrokerStatusResponseBody> {
    this.assertLiveMode();
    await this.brokerSessionManager.ensureSession();
    return this.getBrokerStatus();
  }

  @Post('broker/disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnectBroker(): Promise<BrokerStatusResponseBody> {
    this.assertLiveMode();
    await this.brokerSessionManager.logout();
    return this.getBrokerStatus();
  }

  /**
   * PAPER never has a broker account to summarize — `supported: false` with
   * a reason, not fabricated zeros. In LIVE mode, every numeric field the
   * real Dhan RMS call didn't return (or couldn't be parsed) is `null`,
   * never guessed — see `DhanAccountService`'s own contract.
   */
  @Get('broker-account-summary')
  @UseGuards(JwtAuthGuard)
  async getBrokerAccountSummary(): Promise<BrokerAccountSummaryResponseBody> {
    const emptySummary: BrokerAccountSummary = {
      availableBalance: null,
      usedMargin: null,
      availableMargin: null,
      todaysRealizedPnl: null,
      unrealizedPnl: null,
    };

    if (this.tradingModeService.getCurrentMode() === 'PAPER') {
      return {
        ...emptySummary,
        supported: false,
        reason: 'Paper trading has no broker account — nothing to summarize.',
      };
    }

    const session = this.brokerSessionManager.getActiveSession();
    if (!session || !this.brokerSessionManager.isSessionValid()) {
      return {
        ...emptySummary,
        supported: false,
        reason: 'No active broker session — connect the broker first.',
      };
    }

    const summary = await this.dhanAccountService.getFundsSummary(session);
    return { ...summary, supported: true, reason: null };
  }

  private assertLiveMode(): void {
    if (this.tradingModeService.getCurrentMode() !== 'LIVE') {
      throw new BusinessException(
        'Paper trading has no broker connection to manage — this deployment is in PAPER mode.',
      );
    }
  }
}
