import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@core/config/config.service';
import {
  BROKER_NAME_DHAN,
  BROKER_TOKEN_REPOSITORY,
} from '@modules/broker/broker-auth/broker-auth.constants';
import type { IBrokerTokenRepository } from '@modules/broker/broker-auth/interfaces/broker-token-repository.interface';
import { SYSTEM_USER_ID } from '@shared/constants/system-user.constant';
import type { MarketDataCredentials } from './models/market-data-credentials.model';
import { MarketDataCredentialsMissingException } from './exceptions/market-data-credentials-missing.exception';

/**
 * The market-data feed's own, independent credential source — deliberately
 * NOT a dependency on `BrokerSessionManager`. `BrokerSessionManager` owns the
 * stateful login/refresh/reauth lifecycle for placing LIVE orders; market
 * data must be able to connect and stream real prices whether or not that
 * lifecycle has ever been started (Paper Mode ships real prices without any
 * broker ever being "connected" for trading, and disconnecting/removing a
 * broker for order execution must never interrupt the price feed).
 *
 * Resolution order: the most recently persisted token for the configured
 * broker (opportunistically fresher, if a broker session has ever
 * successfully authenticated) falling back to the static
 * DHAN_ACCESS_TOKEN/DHAN_CLIENT_ID bootstrap-seed env vars — the same
 * fallback convention BrokerSessionManager itself uses for its first-ever
 * login. Reading the token repository directly (a plain data store) rather
 * than injecting BrokerSessionManager keeps this class free of any
 * dependency on broker-auth's session state machine, its single-flight
 * locking, or its event publishing.
 */
@Injectable()
export class MarketDataCredentialProvider {
  constructor(
    private readonly configService: ConfigService,
    @Inject(BROKER_TOKEN_REPOSITORY)
    private readonly tokenRepository: IBrokerTokenRepository,
  ) {}

  hasCredentials(): boolean {
    return this.configService.hasDhanCredentials;
  }

  async getCredentials(): Promise<MarketDataCredentials> {
    if (!this.hasCredentials()) {
      throw new MarketDataCredentialsMissingException();
    }

    const stored = await this.tokenRepository
      .find(SYSTEM_USER_ID, BROKER_NAME_DHAN)
      .catch(() => null);

    return {
      clientId: this.configService.dhanClientId,
      accessToken:
        stored?.token.getAccessToken() ?? this.configService.dhanAccessToken,
    };
  }
}
