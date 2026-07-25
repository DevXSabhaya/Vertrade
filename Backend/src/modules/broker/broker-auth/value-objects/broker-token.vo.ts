import { inspect } from 'node:util';

/** Same redaction discipline as BrokerCredentials — the JWT/refresh/feed tokens must never leak. */
export class BrokerToken {
  constructor(
    private readonly jwtToken: string,
    private readonly refreshToken: string,
    private readonly feedToken: string,
  ) {}

  getJwtToken(): string {
    return this.jwtToken;
  }

  getRefreshToken(): string {
    return this.refreshToken;
  }

  getFeedToken(): string {
    return this.feedToken;
  }

  toJSON(): Record<string, unknown> {
    return {
      jwtToken: '[REDACTED]',
      refreshToken: '[REDACTED]',
      feedToken: '[REDACTED]',
    };
  }

  toString(): string {
    return 'BrokerToken([REDACTED])';
  }

  [inspect.custom](): string {
    return this.toString();
  }
}
