import { Injectable } from '@nestjs/common';
import { ConfigService } from '@core/config/config.service';
import type { MarketDataCredentials } from './models/market-data-credentials.model';
import { MarketDataCredentialsMissingException } from './exceptions/market-data-credentials-missing.exception';

/**
 * The market-data feed's own, independent, static credential source —
 * deliberately NOT tied to any user's `BrokerAccount` or `BrokerSessionManager`
 * session. Market data is a single feed shared by every user regardless of
 * which broker (if any) they've personally connected for order execution
 * (Paper Mode ships real prices without any broker ever being "connected"
 * for trading, and a user disconnecting/switching their own broker account
 * must never interrupt the shared price feed for anyone). Always the
 * deployment's own env-configured `DHAN_ACCESS_TOKEN`/`DHAN_CLIENT_ID` — the
 * platform's dedicated market-data credential, never a per-user broker
 * account's.
 */
@Injectable()
export class MarketDataCredentialProvider {
  constructor(private readonly configService: ConfigService) {}

  hasCredentials(): boolean {
    return this.configService.hasDhanCredentials;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to satisfy existing callers/interface shape; no I/O needed now that this is purely env-sourced.
  async getCredentials(): Promise<MarketDataCredentials> {
    if (!this.hasCredentials()) {
      throw new MarketDataCredentialsMissingException();
    }

    return {
      clientId: this.configService.dhanClientId,
      accessToken: this.configService.dhanAccessToken,
    };
  }
}
