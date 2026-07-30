import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@core/config/config.service';
import { BROKER_HTTP_CLIENT } from './broker-auth.constants';
import type { IBrokerHttpClient } from './interfaces/broker-http-client.interface';
import type { BrokerSession } from './entities/broker-session.entity';

/**
 * DhanHQ v2's Fund Limit endpoint — the closest thing it exposes to an
 * account/funds summary. Not exercised against the real API in this
 * environment (no live credentials); verify against a real/sandbox account
 * before relying on it in production, exactly like `DhanBrokerAuth`'s own
 * login call.
 */
const FUND_LIMIT_PATH = '/fundlimit';

interface DhanFundLimitResponseBody {
  dhanClientId?: string;
  sodLimit?: number;
  collateralAmount?: number;
  receiveableAmount?: number;
  utilizedAmount?: number;
  blockedPayoutAmount?: number;
  withdrawableBalance?: number;
  /**
   * Handles both spellings defensively: Dhan's own published docs have
   * shown this field as `availabelBalance` (a documented typo) at times and
   * `availableBalance` at others — both are read, neither is guessed.
   */
  availableBalance?: number;
  availabelBalance?: number;
}

/**
 * What this integration can actually surface from Dhan's fund-limit
 * response — every field is `null` (never fabricated) when Dhan didn't
 * return it or it wasn't a usable number. Dhan's fund-limit endpoint has no
 * concept of realized/unrealized P&L (that lives behind the separate
 * positions endpoint this service does not call) — callers must treat a
 * `null` field as "unsupported by this endpoint", not "zero".
 */
export interface BrokerAccountSummary {
  readonly availableBalance: number | null;
  readonly usedMargin: number | null;
  readonly availableMargin: number | null;
  readonly todaysRealizedPnl: number | null;
  readonly unrealizedPnl: number | null;
}

@Injectable()
export class DhanAccountService {
  private readonly logger = new Logger(DhanAccountService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(BROKER_HTTP_CLIENT) private readonly httpClient: IBrokerHttpClient,
  ) {}

  async getFundsSummary(session: BrokerSession): Promise<BrokerAccountSummary> {
    const response = await this.httpClient.request<
      DhanFundLimitResponseBody | Record<string, never>
    >({
      method: 'GET',
      url: `${this.configService.dhanRestUrl}${FUND_LIMIT_PATH}`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'access-token': session.token.getAccessToken(),
      },
    });

    const data = response.body as DhanFundLimitResponseBody;
    if (
      typeof data !== 'object' ||
      data === null ||
      (data.availableBalance === undefined &&
        data.availabelBalance === undefined &&
        data.sodLimit === undefined)
    ) {
      this.logger.warn('Dhan fund-limit request did not return usable data');
      return this.emptySummary();
    }

    const available = data.availableBalance ?? data.availabelBalance ?? null;
    return {
      availableBalance: this.parseNumber(available),
      usedMargin: this.parseNumber(data.utilizedAmount),
      availableMargin: this.parseNumber(data.withdrawableBalance ?? available),
      // Dhan's fund-limit endpoint carries no P&L fields — never fabricated.
      todaysRealizedPnl: null,
      unrealizedPnl: null,
    };
  }

  private parseNumber(value: number | null | undefined): number | null {
    if (value === undefined || value === null) {
      return null;
    }
    return Number.isFinite(value) ? value : null;
  }

  private emptySummary(): BrokerAccountSummary {
    return {
      availableBalance: null,
      usedMargin: null,
      availableMargin: null,
      todaysRealizedPnl: null,
      unrealizedPnl: null,
    };
  }
}
