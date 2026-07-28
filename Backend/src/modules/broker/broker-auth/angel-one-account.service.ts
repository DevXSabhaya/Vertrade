import { Inject, Injectable, Logger } from '@nestjs/common';
import { BROKER_HTTP_CLIENT } from './broker-auth.constants';
import type { IBrokerHttpClient } from './interfaces/broker-http-client.interface';
import { BrokerCredentialsProvider } from './broker-credentials.provider';
import type { BrokerSession } from './entities/broker-session.entity';
import {
  getLocalIp,
  getMacAddress,
  getPublicIp,
} from './utils/client-network-info.util';

/**
 * Angel One SmartAPI's RMS (Risk Management System) endpoint — the closest
 * thing it exposes to an account/funds summary. Not exercised against the
 * real API in this environment (no live credentials); verify against a
 * real/sandbox account before relying on it in production, exactly like
 * `AngelOneBrokerAuth`'s own login/refresh/logout calls.
 */
const BASE_URL = 'https://apiconnect.angelbroking.com';
const RMS_PATH = '/rest/secure/angelbroking/user/v1/getRMS';

interface AngelOneRmsData {
  net?: string;
  availablecash?: string;
  availableintradaypayin?: string;
  availablelimitmargin?: string;
  collateral?: string;
  m2munrealized?: string;
  m2mrealized?: string;
  utiliseddebits?: string;
}

interface AngelOneRmsResponseBody {
  status: boolean;
  message: string;
  errorcode: string;
  data: AngelOneRmsData | null;
}

/**
 * What this integration can actually surface from Angel One's RMS response —
 * every field is `null` (never fabricated) when Angel One didn't return it
 * or it wasn't a parseable number. Angel One's RMS response has no concept
 * of "overall P&L" or open-position count (those live behind separate
 * report/position APIs this integration does not call) — callers must treat
 * a `null` field as "unsupported by this endpoint", not "zero".
 */
export interface BrokerAccountSummary {
  readonly availableBalance: number | null;
  readonly usedMargin: number | null;
  readonly availableMargin: number | null;
  readonly todaysRealizedPnl: number | null;
  readonly unrealizedPnl: number | null;
}

@Injectable()
export class AngelOneAccountService {
  private readonly logger = new Logger(AngelOneAccountService.name);

  constructor(
    private readonly credentialsProvider: BrokerCredentialsProvider,
    @Inject(BROKER_HTTP_CLIENT) private readonly httpClient: IBrokerHttpClient,
  ) {}

  async getFundsSummary(session: BrokerSession): Promise<BrokerAccountSummary> {
    const credentials = this.credentialsProvider.getCredentials();

    const response = await this.httpClient.request<AngelOneRmsResponseBody>({
      method: 'GET',
      url: `${BASE_URL}${RMS_PATH}`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-PrivateKey': credentials.apiKey,
        'X-ClientLocalIP': getLocalIp(),
        'X-ClientPublicIP': getPublicIp(),
        'X-MACAddress': getMacAddress(),
        Authorization: `Bearer ${session.token.getJwtToken()}`,
      },
    });

    if (!response.body.status || !response.body.data) {
      this.logger.warn(
        `Angel One RMS request did not return usable data: ${response.body.message} ${response.body.errorcode}`,
      );
      return this.emptySummary();
    }

    const data = response.body.data;
    return {
      availableBalance: this.parseNumber(data.availablecash),
      usedMargin: this.parseNumber(data.utiliseddebits),
      availableMargin: this.parseNumber(data.availablelimitmargin ?? data.net),
      todaysRealizedPnl: this.parseNumber(data.m2mrealized),
      unrealizedPnl: this.parseNumber(data.m2munrealized),
    };
  }

  private parseNumber(value: string | undefined): number | null {
    if (value === undefined) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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
