import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@core/config/config.service';
import { BROKER_HTTP_CLIENT } from './broker-auth.constants';
import type { IBrokerHttpClient } from './interfaces/broker-http-client.interface';
import type { IBrokerAuth } from './interfaces/broker-auth.interface';
import { BrokerCredentialsProvider } from './broker-credentials.provider';
import { BrokerSession } from './entities/broker-session.entity';
import { BrokerToken } from './value-objects/broker-token.vo';
import { decodeJwtExpiry } from './utils/jwt.util';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { BrokerNetworkException } from './exceptions/broker-network.exception';
import { BrokerTimeoutException } from './exceptions/broker-timeout.exception';
import { BrokerSessionExpiredException } from './exceptions/broker-session-expired.exception';

/**
 * DhanHQ v2 endpoint path used purely as a cheap, authenticated
 * "is this access token valid" probe — per its publicly documented REST
 * contract (https://dhanhq.co/docs/v2/funds/). Not exercised against the
 * real API in this environment (no live credentials, and automated tests
 * must never call the real API) — verify against a real/sandbox account
 * before enabling Live trading.
 */
const FUND_LIMIT_PATH = '/fundlimit';

/**
 * DhanHQ v2's real token-renewal endpoint
 * (https://dhanhq.co/docs/v2/authentication/) — POST with `access-token` +
 * `dhanClientId` headers, no body. Works only for tokens generated via the
 * Dhan web console (exactly the flow this app uses — see class docstring)
 * and only while the token is still active; renewing an already-expired
 * token returns an error. Not exercised against the real API in this
 * environment — verify against a real/sandbox account before enabling Live
 * trading.
 */
const RENEW_TOKEN_PATH = '/RenewToken';

/** Used only when the access token has no decodable `exp` claim. */
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface DhanErrorBody {
  errorCode?: string;
  errorType?: string;
  errorMessage?: string;
}

interface DhanRenewTokenResponseBody {
  accessToken?: string;
}

function isDhanRenewTokenResponseBody(
  value: unknown,
): value is DhanRenewTokenResponseBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    !('accessToken' in candidate) || typeof candidate.accessToken === 'string'
  );
}

/**
 * DhanHQ auth is fundamentally different from Angel One's: there is no
 * password+TOTP login flow to automate. The access token is a 24-hour JWT
 * the operator generates manually in the Dhan web console (Profile ->
 * Access DhanHQ APIs) and supplies via `DHAN_ACCESS_TOKEN`. So:
 *  - login() treats that configured token as already-issued credentials and
 *    validates it with a cheap authenticated GET call, rather than
 *    exchanging a password for a token. It optionally accepts an
 *    explicit override token (the manual reconnect flow) instead of the
 *    configured `DHAN_ACCESS_TOKEN`.
 *  - refresh() calls DhanHQ's real `POST /v2/RenewToken` endpoint, which
 *    exchanges the current (still-active) session token for a brand new
 *    24-hour one — this only works for web-console-generated tokens, which
 *    is exactly what `login()` establishes. Per DhanHQ's official docs
 *    (https://dhanhq.co/docs/v2/authentication/): "This only renews tokens
 *    which are active. If you try to renew an expired token, it will
 *    return an error." There is no programmatic way to revive an
 *    already-expired token — deliberately does NOT fall back to
 *    re-validating the static `DHAN_ACCESS_TOKEN` env value on failure
 *    (a prior version of this class did; that silently degraded over time,
 *    since a renewed token's expiry clock resets on every successful
 *    renewal while the static env token's clock never does, making the
 *    fallback progressively less likely to succeed and masking real
 *    expiry as a working session). Failure here always means "a human
 *    needs to generate a fresh token in the Dhan console" —
 *    `BrokerSessionExpiredException` communicates that unambiguously so
 *    `BrokerSessionManager` can enter REAUTH_REQUIRED instead of silently
 *    degrading.
 *  - logout() is a local-only no-op: Dhan has no session-revocation
 *    endpoint for this token type, so there's nothing to call — the
 *    session is simply forgotten locally by BrokerSessionManager.
 */
@Injectable()
export class DhanBrokerAuth implements IBrokerAuth {
  constructor(
    private readonly credentialsProvider: BrokerCredentialsProvider,
    private readonly configService: ConfigService,
    @Inject(BROKER_HTTP_CLIENT) private readonly httpClient: IBrokerHttpClient,
  ) {}

  async login(
    overrideAccessToken?: string,
    overrideClientId?: string,
  ): Promise<BrokerSession> {
    const credentials = this.credentialsProvider.getCredentials();
    const accessToken = overrideAccessToken ?? credentials.getAccessToken();
    const clientId = overrideClientId ?? credentials.clientId;

    const response = await this.safeRequest(() =>
      this.httpClient.request<unknown>({
        method: 'GET',
        url: `${this.configService.dhanRestUrl}${FUND_LIMIT_PATH}`,
        headers: this.buildHeaders(accessToken),
      }),
    );

    this.assertSuccess(response.status, response.body);
    return this.toSession(clientId, accessToken);
  }

  async refresh(session: BrokerSession): Promise<BrokerSession> {
    const response = await this.safeRequest(() =>
      this.httpClient.request<unknown>({
        method: 'POST',
        url: `${this.configService.dhanRestUrl}${RENEW_TOKEN_PATH}`,
        headers: {
          ...this.buildHeaders(session.token.getAccessToken()),
          dhanClientId: session.clientCode,
        },
      }),
    );

    if (
      response.status >= 200 &&
      response.status < 300 &&
      isDhanRenewTokenResponseBody(response.body) &&
      response.body.accessToken
    ) {
      return this.toSession(session.clientCode, response.body.accessToken);
    }

    // RenewToken only works on a still-active token, per DhanHQ's official
    // docs (see class docstring) — a rejection here means the token is
    // genuinely expired, not something a fallback can paper over. Surface
    // this honestly so BrokerSessionManager enters REAUTH_REQUIRED.
    const errorBody = this.asDhanErrorBody(response.body);
    throw new BrokerSessionExpiredException(
      errorBody?.errorMessage ||
        `Dhan rejected the token renewal request (HTTP ${response.status}) — the broker session has expired and requires manual reconnection`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- IBrokerAuth.logout(session) contract; nothing to call for Dhan's static-token model — see class docstring.
  async logout(session: BrokerSession): Promise<void> {
    return Promise.resolve();
  }

  validateSession(session: BrokerSession): boolean {
    return !session.isExpired();
  }

  private buildHeaders(accessToken: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'access-token': accessToken,
    };
  }

  private async safeRequest<T>(
    fn: () => Promise<{ status: number; body: T }>,
  ): Promise<{ status: number; body: T }> {
    try {
      return await fn();
    } catch (error) {
      const name = this.getErrorName(error);
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new BrokerTimeoutException('Dhan request timed out');
      }
      const message =
        error instanceof Error ? error.message : 'Dhan request failed';
      throw new BrokerNetworkException(`Dhan request failed: ${message}`);
    }
  }

  private getErrorName(error: unknown): string | undefined {
    if (typeof error === 'object' && error !== null && 'name' in error) {
      return String(error.name);
    }
    return undefined;
  }

  private assertSuccess(status: number, body: unknown): void {
    if (status >= 200 && status < 300) {
      return;
    }

    const errorBody = this.asDhanErrorBody(body);
    throw new InvalidCredentialsException(
      errorBody?.errorMessage ||
        `Dhan rejected the configured access token (HTTP ${status})`,
    );
  }

  private asDhanErrorBody(body: unknown): DhanErrorBody | null {
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    return body;
  }

  private toSession(clientId: string, accessToken: string): BrokerSession {
    const issuedAt = new Date();
    const expiresAt =
      decodeJwtExpiry(accessToken) ??
      new Date(issuedAt.getTime() + DEFAULT_SESSION_TTL_MS);

    return new BrokerSession(
      clientId,
      new BrokerToken(accessToken),
      issuedAt,
      expiresAt,
    );
  }
}
