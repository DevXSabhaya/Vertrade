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

  get angelOneApiKey(): string {
    return this.nestConfigService.get('ANGEL_ONE_API_KEY', { infer: true });
  }

  get angelOneClientCode(): string {
    return this.nestConfigService.get('ANGEL_ONE_CLIENT_CODE', { infer: true });
  }

  get angelOnePassword(): string {
    return this.nestConfigService.get('ANGEL_ONE_PASSWORD', { infer: true });
  }

  get angelOneTotpSecret(): string {
    return this.nestConfigService.get('ANGEL_ONE_TOTP_SECRET', { infer: true });
  }

  /** Reserved for future Angel One request-signing/checksum support — not yet consumed by any broker call. Only required when TRADING_MODE=LIVE. */
  get angelOneApiSecret(): string {
    return this.nestConfigService.get('ANGEL_ONE_API_SECRET', { infer: true });
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
  get hasAngelOneCredentials(): boolean {
    return (
      this.angelOneApiKey.trim() !== '' &&
      this.angelOneClientCode.trim() !== '' &&
      this.angelOnePassword.trim() !== '' &&
      this.angelOneTotpSecret.trim() !== ''
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

  get smtpHost(): string {
    return this.nestConfigService.get('SMTP_HOST', { infer: true });
  }

  get smtpPort(): number {
    return this.nestConfigService.get('SMTP_PORT', { infer: true });
  }

  get smtpSecure(): boolean {
    return this.nestConfigService.get('SMTP_SECURE', { infer: true });
  }

  get smtpUser(): string {
    return this.nestConfigService.get('SMTP_USER', { infer: true });
  }

  get smtpPass(): string {
    return this.nestConfigService.get('SMTP_PASS', { infer: true });
  }

  get smtpFrom(): string {
    return this.nestConfigService.get('SMTP_FROM', { infer: true });
  }

  get smtpFromName(): string {
    return this.nestConfigService.get('SMTP_FROM_NAME', { infer: true });
  }

  get resendApiKey(): string {
    return this.nestConfigService.get('RESEND_API_KEY', { infer: true });
  }

  get emailFrom(): string {
    return this.nestConfigService.get('EMAIL_FROM', { infer: true });
  }

  get emailFromName(): string {
    return this.nestConfigService.get('EMAIL_FROM_NAME', { infer: true });
  }
}
