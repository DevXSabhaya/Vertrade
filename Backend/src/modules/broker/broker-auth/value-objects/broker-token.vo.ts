import { inspect } from 'node:util';

/**
 * DhanHQ issues a single access token used for both REST calls (the
 * `access-token` header) and the WebSocket live market feed (an auth query
 * param) — unlike Angel One's three-token model (jwt/refresh/feed), there is
 * only one secret to carry here. Same redaction discipline as
 * BrokerCredentials — the token must never leak via logging.
 */
export class BrokerToken {
  constructor(private readonly accessToken: string) {}

  getAccessToken(): string {
    return this.accessToken;
  }

  toJSON(): Record<string, unknown> {
    return {
      accessToken: '[REDACTED]',
    };
  }

  toString(): string {
    return 'BrokerToken([REDACTED])';
  }

  [inspect.custom](): string {
    return this.toString();
  }
}
