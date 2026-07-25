import { BrokerToken } from '../value-objects/broker-token.vo';

export class BrokerSession {
  constructor(
    public readonly clientCode: string,
    public readonly token: BrokerToken,
    public readonly issuedAt: Date,
    public readonly expiresAt: Date,
  ) {}

  isExpired(now: Date = new Date()): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  toJSON(): Record<string, unknown> {
    return {
      clientCode: this.clientCode,
      token: this.token.toJSON(),
      issuedAt: this.issuedAt,
      expiresAt: this.expiresAt,
    };
  }
}
