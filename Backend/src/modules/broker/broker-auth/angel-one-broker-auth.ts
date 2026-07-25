import { Inject, Injectable } from '@nestjs/common';
import { BROKER_HTTP_CLIENT } from './broker-auth.constants';
import type { IBrokerHttpClient } from './interfaces/broker-http-client.interface';
import type { IBrokerAuth } from './interfaces/broker-auth.interface';
import { BrokerCredentialsProvider } from './broker-credentials.provider';
import { BrokerSession } from './entities/broker-session.entity';
import { BrokerToken } from './value-objects/broker-token.vo';
import { generateTotp } from './totp/totp.generator';
import { decodeJwtExpiry } from './utils/jwt.util';
import {
  getLocalIp,
  getMacAddress,
  getPublicIp,
} from './utils/client-network-info.util';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { InvalidTotpException } from './exceptions/invalid-totp.exception';
import { BrokerNetworkException } from './exceptions/broker-network.exception';
import { BrokerTimeoutException } from './exceptions/broker-timeout.exception';

/**
 * Angel One SmartAPI endpoint paths, per its publicly documented REST contract.
 * These have not been exercised against the real API in this environment (no
 * live credentials, and automated tests must never call the real API) — verify
 * against a real/sandbox account before enabling Live trading.
 */
const BASE_URL = 'https://apiconnect.angelbroking.com';
const LOGIN_PATH = '/rest/auth/angelbroking/user/v1/loginByPassword';
const REFRESH_PATH = '/rest/auth/angelbroking/jwt/v1/generateTokens';
const LOGOUT_PATH = '/rest/auth/angelbroking/user/v1/logout';

/** Used only when the jwtToken has no decodable `exp` claim. */
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface AngelOneTokenData {
  jwtToken: string;
  refreshToken: string;
  feedToken?: string;
}

interface AngelOneResponseBody {
  status: boolean;
  message: string;
  errorcode: string;
  data: AngelOneTokenData | null;
}

@Injectable()
export class AngelOneBrokerAuth implements IBrokerAuth {
  constructor(
    private readonly credentialsProvider: BrokerCredentialsProvider,
    @Inject(BROKER_HTTP_CLIENT) private readonly httpClient: IBrokerHttpClient,
  ) {}

  async login(): Promise<BrokerSession> {
    const credentials = this.credentialsProvider.getCredentials();
    const totp = generateTotp(credentials.getTotpSecret());

    const response = await this.safeRequest(() =>
      this.httpClient.request<AngelOneResponseBody>({
        method: 'POST',
        url: `${BASE_URL}${LOGIN_PATH}`,
        headers: this.buildHeaders(credentials.apiKey),
        body: {
          clientcode: credentials.clientCode,
          password: credentials.getPassword(),
          totp,
        },
      }),
    );

    this.assertSuccess(response.body);
    return this.toSession(
      credentials.clientCode,
      this.requireData(response.body),
    );
  }

  async refresh(session: BrokerSession): Promise<BrokerSession> {
    const credentials = this.credentialsProvider.getCredentials();

    const response = await this.safeRequest(() =>
      this.httpClient.request<AngelOneResponseBody>({
        method: 'POST',
        url: `${BASE_URL}${REFRESH_PATH}`,
        headers: this.buildHeaders(
          credentials.apiKey,
          session.token.getJwtToken(),
        ),
        body: { refreshToken: session.token.getRefreshToken() },
      }),
    );

    this.assertSuccess(response.body);
    const data = this.requireData(response.body);
    return this.toSession(session.clientCode, {
      jwtToken: data.jwtToken,
      refreshToken: data.refreshToken,
      feedToken: data.feedToken ?? session.token.getFeedToken(),
    });
  }

  async logout(session: BrokerSession): Promise<void> {
    const credentials = this.credentialsProvider.getCredentials();

    const response = await this.safeRequest(() =>
      this.httpClient.request<AngelOneResponseBody>({
        method: 'POST',
        url: `${BASE_URL}${LOGOUT_PATH}`,
        headers: this.buildHeaders(
          credentials.apiKey,
          session.token.getJwtToken(),
        ),
        body: { clientcode: session.clientCode },
      }),
    );

    this.assertSuccess(response.body);
  }

  validateSession(session: BrokerSession): boolean {
    return !session.isExpired();
  }

  private buildHeaders(
    apiKey: string,
    jwtToken?: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-PrivateKey': apiKey,
      'X-ClientLocalIP': getLocalIp(),
      'X-ClientPublicIP': getPublicIp(),
      'X-MACAddress': getMacAddress(),
    };
    if (jwtToken) {
      headers.Authorization = `Bearer ${jwtToken}`;
    }
    return headers;
  }

  private async safeRequest<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const name = this.getErrorName(error);
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new BrokerTimeoutException('Angel One request timed out');
      }
      const message =
        error instanceof Error ? error.message : 'Angel One request failed';
      throw new BrokerNetworkException(`Angel One request failed: ${message}`);
    }
  }

  private getErrorName(error: unknown): string | undefined {
    if (typeof error === 'object' && error !== null && 'name' in error) {
      return String(error.name);
    }
    return undefined;
  }

  /** Generic status check — logout responses have `data: null` even on success, so data is checked separately. */
  private assertSuccess(body: AngelOneResponseBody): void {
    if (body.status) {
      return;
    }

    const reason = `${body.message} ${body.errorcode}`.toLowerCase();
    if (reason.includes('totp') || reason.includes('otp')) {
      throw new InvalidTotpException(body.message || 'Invalid TOTP');
    }
    throw new InvalidCredentialsException(
      body.message || 'Invalid credentials',
    );
  }

  /** Only login/refresh need the data payload; call after assertSuccess() has already confirmed status. */
  private requireData(body: AngelOneResponseBody): AngelOneTokenData {
    if (!body.data) {
      throw new InvalidCredentialsException(
        body.message || 'Angel One response missing token data',
      );
    }
    return body.data;
  }

  private toSession(
    clientCode: string,
    data: AngelOneTokenData,
  ): BrokerSession {
    const issuedAt = new Date();
    const expiresAt =
      decodeJwtExpiry(data.jwtToken) ??
      new Date(issuedAt.getTime() + DEFAULT_SESSION_TTL_MS);

    return new BrokerSession(
      clientCode,
      new BrokerToken(data.jwtToken, data.refreshToken, data.feedToken ?? ''),
      issuedAt,
      expiresAt,
    );
  }
}
