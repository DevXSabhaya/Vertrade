import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from './env.validation';
import { parseAllowedOrigins } from './cors-origin.util';

@Injectable()
export class ConfigService {
  constructor(
    private readonly nestConfigService: NestConfigService<
      EnvironmentVariables,
      true
    >,
  ) {}

  get nodeEnv(): EnvironmentVariables['NODE_ENV'] {
    return this.nestConfigService.get('NODE_ENV', { infer: true });
  }

  get port(): number {
    return this.nestConfigService.get('PORT', { infer: true });
  }

  get mongodbUri(): string {
    return this.nestConfigService.get('MONGODB_URI', { infer: true });
  }

  get dhanClientId(): string {
    return this.nestConfigService.get('DHAN_CLIENT_ID', { infer: true });
  }

  /**
   * Never required. Per DhanHQ's official v2 authentication docs
   * (https://dhanhq.co/docs/v2/authentication/), `app_id`/`app_secret` are
   * only used by the OAuth "consent" flow that *issues* an access token for
   * a partner app — no REST/WebSocket call ever sends this value, and
   * `env.validation.ts` deliberately does not require it even when
   * TRADING_MODE=LIVE (the operator-generated-web-console-token flow this
   * app uses needs only `dhanClientId` + `access-token`). Reserved purely
   * for a future OAuth-consent-flow implementation.
   */
  get dhanApiKey(): string {
    return this.nestConfigService.get('DHAN_API_KEY', { infer: true });
  }

  get dhanAccessToken(): string {
    return this.nestConfigService.get('DHAN_ACCESS_TOKEN', { infer: true });
  }

  get dhanRestUrl(): string {
    return this.nestConfigService.get('DHAN_REST_URL', { infer: true });
  }

  get dhanWsUrl(): string {
    return this.nestConfigService.get('DHAN_WS_URL', { infer: true });
  }

  get tokenEncryptionKey(): string {
    return this.nestConfigService.get('TOKEN_ENCRYPTION_KEY', { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get marketDataProvider(): EnvironmentVariables['MARKET_DATA_PROVIDER'] {
    return this.nestConfigService.get('MARKET_DATA_PROVIDER', { infer: true });
  }

  get tradingMode(): EnvironmentVariables['TRADING_MODE'] {
    return this.nestConfigService.get('TRADING_MODE', { infer: true });
  }

  /**
   * Presence only (non-empty strings) — not a placeholder/strength check
   * (that already happened at boot in `env.validation.ts` if `TRADING_MODE`
   * started as `LIVE`). Used by `TradingModeService` to give a clear,
   * specific error when an operator tries to switch to LIVE at runtime on a
   * deployment that only ever configured Paper — `BrokerSessionManager`
   * would eventually fail anyway, but this catches the common case fast
   * without an unnecessary network round trip.
   */
  get hasDhanCredentials(): boolean {
    return (
      this.dhanClientId.trim() !== '' && this.dhanAccessToken.trim() !== ''
    );
  }

  get killSwitchEnabled(): boolean {
    return this.nestConfigService.get('KILL_SWITCH_ENABLED', { infer: true });
  }

  get healthCheckIntervalMs(): number {
    return this.nestConfigService.get('HEALTH_CHECK_INTERVAL_MS', {
      infer: true,
    });
  }

  get heartbeatTimeoutMs(): number {
    return this.nestConfigService.get('HEARTBEAT_TIMEOUT_MS', { infer: true });
  }

  get maintenanceMode(): boolean {
    return this.nestConfigService.get('MAINTENANCE_MODE', { infer: true });
  }

  get marketOpenTime(): string {
    return this.nestConfigService.get('MARKET_OPEN_TIME', { infer: true });
  }

  get marketCloseTime(): string {
    return this.nestConfigService.get('MARKET_CLOSE_TIME', { infer: true });
  }

  get jwtSecret(): string {
    return this.nestConfigService.get('JWT_SECRET', { infer: true });
  }

  get jwtExpiresIn(): string {
    return this.nestConfigService.get('JWT_EXPIRES_IN', { infer: true });
  }

  get paperTradingInitialBalance(): number {
    return this.nestConfigService.get('PAPER_TRADING_INITIAL_BALANCE', {
      infer: true,
    });
  }

  get frontendUrl(): string {
    return this.nestConfigService.get('FRONTEND_URL', { infer: true });
  }

  /** One or more explicitly-trusted CORS origins, parsed from the (optionally comma-separated) `FRONTEND_URL` value. */
  get frontendUrls(): string[] {
    return parseAllowedOrigins(this.frontendUrl);
  }

  get instrumentMasterProvider(): EnvironmentVariables['INSTRUMENT_MASTER_PROVIDER'] {
    return this.nestConfigService.get('INSTRUMENT_MASTER_PROVIDER', {
      infer: true,
    });
  }

  get emailProvider(): EnvironmentVariables['EMAIL_PROVIDER'] {
    return this.nestConfigService.get('EMAIL_PROVIDER', { infer: true });
  }

  get googleClientId(): string {
    return this.nestConfigService.get('GOOGLE_CLIENT_ID', { infer: true });
  }

  get googleClientSecret(): string {
    return this.nestConfigService.get('GOOGLE_CLIENT_SECRET', {
      infer: true,
    });
  }

  get googleRefreshToken(): string {
    return this.nestConfigService.get('GOOGLE_REFRESH_TOKEN', {
      infer: true,
    });
  }

  get googleRedirectUri(): string {
    return this.nestConfigService.get('GOOGLE_REDIRECT_URI', {
      infer: true,
    });
  }

  get emailFrom(): string {
    return this.nestConfigService.get('EMAIL_FROM', { infer: true });
  }

  get emailFromName(): string {
    return this.nestConfigService.get('EMAIL_FROM_NAME', { infer: true });
  }
}
