import { inspect } from 'node:util';

/**
 * Wraps the raw Angel One credentials. Password and TOTP secret are private
 * fields with explicit getters — and toJSON()/toString()/util.inspect are all
 * overridden to redact them, so even an accidental console.log(credentials)
 * or JSON.stringify(credentials) cannot leak a secret.
 */
export class BrokerCredentials {
  constructor(
    public readonly apiKey: string,
    public readonly clientCode: string,
    private readonly password: string,
    private readonly totpSecret: string,
  ) {}

  getPassword(): string {
    return this.password;
  }

  getTotpSecret(): string {
    return this.totpSecret;
  }

  toJSON(): Record<string, unknown> {
    return {
      apiKey: this.apiKey,
      clientCode: this.clientCode,
      password: '[REDACTED]',
      totpSecret: '[REDACTED]',
    };
  }

  toString(): string {
    return `BrokerCredentials(clientCode=${this.clientCode})`;
  }

  [inspect.custom](): string {
    return this.toString();
  }
}
