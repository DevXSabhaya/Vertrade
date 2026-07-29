export interface EnvironmentVariables {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  MONGODB_URI: string;
  ANGEL_ONE_API_KEY: string;
  ANGEL_ONE_CLIENT_CODE: string;
  ANGEL_ONE_PASSWORD: string;
  ANGEL_ONE_TOTP_SECRET: string;
  ANGEL_ONE_API_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  MARKET_DATA_PROVIDER: 'MOCK' | 'ANGEL_ONE';
  INSTRUMENT_MASTER_PROVIDER: 'MOCK' | 'ANGEL_ONE';
  TRADING_MODE: 'PAPER' | 'LIVE';
  KILL_SWITCH_ENABLED: boolean;
  HEALTH_CHECK_INTERVAL_MS: number;
  HEARTBEAT_TIMEOUT_MS: number;
  MAINTENANCE_MODE: boolean;
  MARKET_OPEN_TIME: string;
  MARKET_CLOSE_TIME: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  PAPER_TRADING_INITIAL_BALANCE: number;
  FRONTEND_URL: string;
  EMAIL_PROVIDER: 'DEVELOPMENT' | 'SMTP' | 'RESEND';
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
  SMTP_FROM_NAME: string;
  SMTP_VERIFIED_SENDER: boolean;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  EMAIL_FROM_NAME: string;
}

// Always required, regardless of trading mode — the app has no safe default
// for these.
const REQUIRED_STRING_KEYS: ReadonlyArray<keyof EnvironmentVariables> = [
  'MONGODB_URI',
  'TOKEN_ENCRYPTION_KEY',
  'JWT_SECRET',
];

// Only required when TRADING_MODE=LIVE — a Paper-only deployment must be able
// to boot without ever supplying real broker credentials.
const LIVE_MODE_REQUIRED_STRING_KEYS: ReadonlyArray<
  keyof EnvironmentVariables
> = [
  'ANGEL_ONE_API_KEY',
  'ANGEL_ONE_CLIENT_CODE',
  'ANGEL_ONE_PASSWORD',
  'ANGEL_ONE_TOTP_SECRET',
  'ANGEL_ONE_API_SECRET',
];

function isValidNodeEnv(
  value: unknown,
): value is EnvironmentVariables['NODE_ENV'] {
  return value === 'development' || value === 'production' || value === 'test';
}

function isValidMarketDataProvider(
  value: unknown,
): value is EnvironmentVariables['MARKET_DATA_PROVIDER'] {
  return value === 'MOCK' || value === 'ANGEL_ONE';
}

function isValidTradingMode(
  value: unknown,
): value is EnvironmentVariables['TRADING_MODE'] {
  return value === 'PAPER' || value === 'LIVE';
}

const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidTimeOfDay(value: unknown): value is string {
  return typeof value === 'string' && HH_MM_PATTERN.test(value);
}

/** Phase 20 hardening: production requires a genuinely random secret, not merely a non-empty one — 32 chars is a practical floor for an HS256 JWT signing key / AES key-derivation passphrase. */
const MIN_PRODUCTION_SECRET_LENGTH = 32;

/**
 * Phase 20/21 hardening: catches the exact shape of value a developer
 * pastes into a local `.env` and then forgets to replace — never a
 * substitute for real secret-strength validation (see
 * `MIN_PRODUCTION_SECRET_LENGTH`), just a fast, cheap check for the most
 * common accidental-placeholder patterns.
 */
const PLACEHOLDER_PATTERNS = [
  'changeme',
  'change-me',
  'change_me',
  'placeholder',
  'your-',
  'your_',
  'xxxxx',
  'example',
  'sample',
  'dummy',
  'todo',
  'fixme',
  'replace-me',
  'replace_me',
  'insert-',
  'insert_',
];

function looksLikePlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_PATTERNS.some((pattern) => lower.includes(pattern));
}

function isLocalHost(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes('localhost') || lower.includes('127.0.0.1');
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const errors: string[] = [];

  const nodeEnv: EnvironmentVariables['NODE_ENV'] = isValidNodeEnv(
    config.NODE_ENV,
  )
    ? config.NODE_ENV
    : 'development';

  const portRaw = config.PORT;
  const port = portRaw === undefined || portRaw === '' ? 3000 : Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) {
    errors.push('PORT must be a positive integer');
  }

  for (const key of REQUIRED_STRING_KEYS) {
    const value = config[key];
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${key} is required and must be a non-empty string`);
    }
  }

  // Phase 20 hardening: a non-empty JWT_SECRET/TOKEN_ENCRYPTION_KEY is not
  // enough in production — a short or placeholder-looking value is
  // trivially guessable/brute-forceable. Development/test keep the looser
  // "just non-empty" rule above so a short local dev value still boots.
  if (nodeEnv === 'production') {
    for (const key of ['JWT_SECRET', 'TOKEN_ENCRYPTION_KEY'] as const) {
      const value = config[key];
      if (typeof value === 'string' && value.trim() !== '') {
        if (value.trim().length < MIN_PRODUCTION_SECRET_LENGTH) {
          errors.push(
            `${key} must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production (got ${value.trim().length})`,
          );
        }
        if (looksLikePlaceholder(value)) {
          errors.push(
            `${key} looks like a placeholder value and must be replaced with a real secret in production`,
          );
        }
      }
    }

    const mongodbUriRaw = config.MONGODB_URI;
    if (typeof mongodbUriRaw === 'string' && isLocalHost(mongodbUriRaw)) {
      errors.push(
        'MONGODB_URI must not point at localhost/127.0.0.1 in production — configure the real production database connection string',
      );
    }
  }

  const tradingModeRaw = config.TRADING_MODE;
  const tradingMode =
    tradingModeRaw === undefined || tradingModeRaw === ''
      ? 'PAPER'
      : tradingModeRaw;
  if (!isValidTradingMode(tradingMode)) {
    errors.push('TRADING_MODE must be either PAPER or LIVE');
  }

  // Defaulting these to a flat 'MOCK' regardless of TRADING_MODE let a real
  // LIVE deployment silently run on synthetic/mock instrument and price data
  // whenever an operator forgot to also set these two — indistinguishable
  // from real Angel One data to both the operator and the frontend. Only the
  // *default* (unset) case is tied to TRADING_MODE; an explicit override
  // still wins either way, e.g. pointing a LIVE deployment's market data at
  // MOCK for a rehearsal remains possible if deliberately configured.
  const marketDataProviderRaw = config.MARKET_DATA_PROVIDER;
  const marketDataProvider =
    marketDataProviderRaw === undefined || marketDataProviderRaw === ''
      ? tradingMode === 'LIVE'
        ? 'ANGEL_ONE'
        : 'MOCK'
      : marketDataProviderRaw;
  if (!isValidMarketDataProvider(marketDataProvider)) {
    errors.push('MARKET_DATA_PROVIDER must be either MOCK or ANGEL_ONE');
  }

  const instrumentMasterProviderRaw = config.INSTRUMENT_MASTER_PROVIDER;
  const instrumentMasterProvider =
    instrumentMasterProviderRaw === undefined ||
    instrumentMasterProviderRaw === ''
      ? tradingMode === 'LIVE'
        ? 'ANGEL_ONE'
        : 'MOCK'
      : instrumentMasterProviderRaw;
  if (!isValidMarketDataProvider(instrumentMasterProvider)) {
    errors.push('INSTRUMENT_MASTER_PROVIDER must be either MOCK or ANGEL_ONE');
  }

  // Real broker credentials are only ever a hard requirement once LIVE
  // trading is explicitly selected — a Paper-only deployment must boot
  // cleanly with none of these set.
  if (tradingMode === 'LIVE') {
    for (const key of LIVE_MODE_REQUIRED_STRING_KEYS) {
      const value = config[key];
      if (typeof value !== 'string' || value.trim() === '') {
        errors.push(
          `${key} is required when TRADING_MODE=LIVE and must be a non-empty string`,
        );
      } else if (looksLikePlaceholder(value)) {
        // Phase 21 hardening: real money can move once TRADING_MODE=LIVE —
        // a placeholder-shaped credential (e.g. "placeholder-api-key", the
        // exact value this repo's own .env.example ships for Paper-only
        // local dev) must never be silently accepted as if it were real.
        errors.push(
          `${key} looks like a placeholder value — TRADING_MODE=LIVE requires a real Angel One credential, not a placeholder`,
        );
      }
    }
  }

  // Trimmed defensively — a value pasted into a dashboard env var editor
  // (Render, etc.) commonly picks up a trailing space or newline, which
  // would otherwise silently fail the strict equality checks below despite
  // looking correct at a glance.
  const emailProviderRaw = config.EMAIL_PROVIDER;
  const emailProvider =
    emailProviderRaw === undefined ||
    (typeof emailProviderRaw === 'string' && emailProviderRaw.trim() === '')
      ? 'DEVELOPMENT'
      : typeof emailProviderRaw === 'string'
        ? emailProviderRaw.trim()
        : emailProviderRaw;
  if (
    emailProvider !== 'DEVELOPMENT' &&
    emailProvider !== 'SMTP' &&
    emailProvider !== 'RESEND'
  ) {
    errors.push('EMAIL_PROVIDER must be one of DEVELOPMENT, SMTP, or RESEND');
  }
  // SMTP_VERIFIED_SENDER=true opts out of the SMTP_FROM===SMTP_USER
  // requirement below, for providers that support sending "as" a separately
  // verified sender identity distinct from the authenticated account.
  const smtpVerifiedSenderRaw = config.SMTP_VERIFIED_SENDER;
  const smtpVerifiedSender =
    typeof smtpVerifiedSenderRaw === 'string' &&
    smtpVerifiedSenderRaw.toLowerCase() === 'true';

  let effectiveSmtpFrom = '';
  if (emailProvider === 'SMTP') {
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const) {
      const value = config[key];
      if (typeof value !== 'string' || value.trim() === '') {
        errors.push(
          `${key} is required when EMAIL_PROVIDER=SMTP and must be a non-empty string`,
        );
      }
    }
    const smtpUserRaw = config.SMTP_USER;
    if (
      typeof smtpUserRaw === 'string' &&
      smtpUserRaw.trim() !== '' &&
      !EMAIL_PATTERN.test(smtpUserRaw.trim())
    ) {
      errors.push('SMTP_USER must be a valid email address');
    }

    const smtpFromNameRawForCheck = config.SMTP_FROM_NAME;
    if (
      typeof smtpFromNameRawForCheck !== 'string' ||
      smtpFromNameRawForCheck.trim() === ''
    ) {
      errors.push(
        'SMTP_FROM_NAME is required when EMAIL_PROVIDER=SMTP and must be a non-empty string',
      );
    }

    // SMTP_FROM becomes both the message From address and the envelope
    // sender — a malformed value here is exactly what produces a "no valid
    // From address found in header or envelope" rejection at the SMTP
    // server's DATA stage, so this must fail fast at boot instead of
    // surfacing as an opaque delivery failure per request. If SMTP_FROM is
    // unset, we fall back to the (already-validated) SMTP_USER rather than
    // requiring it be set twice — many relays require exactly this anyway.
    const smtpFromRaw = config.SMTP_FROM;
    const smtpFromProvided =
      typeof smtpFromRaw === 'string' && smtpFromRaw.trim() !== '';
    effectiveSmtpFrom = smtpFromProvided
      ? smtpFromRaw.trim()
      : typeof smtpUserRaw === 'string'
        ? smtpUserRaw.trim()
        : '';

    if (effectiveSmtpFrom === '') {
      errors.push(
        'SMTP_FROM is required when EMAIL_PROVIDER=SMTP and SMTP_USER is not a usable fallback',
      );
    } else if (!EMAIL_PATTERN.test(effectiveSmtpFrom)) {
      errors.push(
        smtpFromProvided
          ? 'SMTP_FROM must be a valid email address'
          : 'SMTP_USER must be a valid email address to use as the SMTP_FROM fallback',
      );
    }

    // Most transactional SMTP relays reject (or silently ignore) a From
    // address that doesn't match the authenticated account unless that
    // address has been separately verified as a sender identity — set
    // SMTP_VERIFIED_SENDER=true to acknowledge that's been done out of band.
    if (
      !smtpVerifiedSender &&
      typeof smtpUserRaw === 'string' &&
      smtpFromProvided &&
      effectiveSmtpFrom.toLowerCase() !== smtpUserRaw.trim().toLowerCase()
    ) {
      errors.push(
        'SMTP_FROM must equal SMTP_USER unless SMTP_VERIFIED_SENDER=true (the SMTP account is not automatically allowed to send as an arbitrary From address)',
      );
    }
  }
  const smtpPortRaw = config.SMTP_PORT;
  const smtpPort =
    smtpPortRaw === undefined || smtpPortRaw === '' ? 587 : Number(smtpPortRaw);
  if (!Number.isInteger(smtpPort) || smtpPort <= 0) {
    errors.push('SMTP_PORT must be a positive integer');
  }

  // Port 465 is implicit TLS (secure=true); every other port (587, 25, ...)
  // uses STARTTLS negotiated after connecting (secure=false). SMTP_SECURE
  // lets an operator override that default explicitly rather than us
  // silently guessing wrong for a non-standard port.
  const smtpSecureRaw = config.SMTP_SECURE;
  let smtpSecure = smtpPort === 465;
  if (smtpSecureRaw !== undefined && smtpSecureRaw !== '') {
    if (smtpSecureRaw !== 'true' && smtpSecureRaw !== 'false') {
      errors.push('SMTP_SECURE must be either "true" or "false"');
    } else {
      smtpSecure = smtpSecureRaw === 'true';
    }
  }
  if (emailProvider === 'SMTP') {
    if (smtpPort === 465 && smtpSecureRaw === 'false') {
      errors.push(
        'SMTP_SECURE=false is invalid with SMTP_PORT=465 (implicit TLS requires secure=true)',
      );
    }
    if (smtpPort === 587 && smtpSecureRaw === 'true') {
      errors.push(
        'SMTP_SECURE=true is invalid with SMTP_PORT=587 (STARTTLS requires secure=false)',
      );
    }
  }

  // RESEND_API_KEY/EMAIL_FROM/EMAIL_FROM_NAME are deliberately their own
  // fields, not SMTP_*: EMAIL_PROVIDER=RESEND never touches SMTP config, and
  // a deployment can have both sets configured at once (e.g. to keep SMTP
  // credentials on file for an easy rollback) without ambiguity about which
  // is currently in use — only EMAIL_PROVIDER decides that.
  if (emailProvider === 'RESEND') {
    const resendApiKeyRaw = config.RESEND_API_KEY;
    if (typeof resendApiKeyRaw !== 'string' || resendApiKeyRaw.trim() === '') {
      errors.push(
        'RESEND_API_KEY is required when EMAIL_PROVIDER=RESEND and must be a non-empty string',
      );
    } else if (
      nodeEnv === 'production' &&
      looksLikePlaceholder(resendApiKeyRaw)
    ) {
      errors.push(
        'RESEND_API_KEY looks like a placeholder value and must be replaced with a real Resend API key in production',
      );
    }

    const emailFromRaw = config.EMAIL_FROM;
    if (
      typeof emailFromRaw !== 'string' ||
      emailFromRaw.trim() === '' ||
      !EMAIL_PATTERN.test(emailFromRaw.trim())
    ) {
      errors.push(
        'EMAIL_FROM is required when EMAIL_PROVIDER=RESEND and must be a valid email address',
      );
    }

    const emailFromNameRaw = config.EMAIL_FROM_NAME;
    if (
      typeof emailFromNameRaw !== 'string' ||
      emailFromNameRaw.trim() === ''
    ) {
      errors.push(
        'EMAIL_FROM_NAME is required when EMAIL_PROVIDER=RESEND and must be a non-empty string',
      );
    }
  }

  const smtpFromNameRaw = config.SMTP_FROM_NAME;
  const smtpFromName =
    smtpFromNameRaw === undefined || smtpFromNameRaw === ''
      ? ''
      : (smtpFromNameRaw as string);

  const killSwitchRaw = config.KILL_SWITCH_ENABLED;
  const killSwitchEnabled =
    typeof killSwitchRaw === 'string' && killSwitchRaw.toLowerCase() === 'true';

  const healthCheckIntervalRaw = config.HEALTH_CHECK_INTERVAL_MS;
  const healthCheckIntervalMs =
    healthCheckIntervalRaw === undefined || healthCheckIntervalRaw === ''
      ? 30_000
      : Number(healthCheckIntervalRaw);
  if (!Number.isInteger(healthCheckIntervalMs) || healthCheckIntervalMs <= 0) {
    errors.push('HEALTH_CHECK_INTERVAL_MS must be a positive integer');
  }

  const heartbeatTimeoutRaw = config.HEARTBEAT_TIMEOUT_MS;
  const heartbeatTimeoutMs =
    heartbeatTimeoutRaw === undefined || heartbeatTimeoutRaw === ''
      ? 15_000
      : Number(heartbeatTimeoutRaw);
  if (!Number.isInteger(heartbeatTimeoutMs) || heartbeatTimeoutMs <= 0) {
    errors.push('HEARTBEAT_TIMEOUT_MS must be a positive integer');
  }

  const maintenanceModeRaw = config.MAINTENANCE_MODE;
  const maintenanceMode =
    typeof maintenanceModeRaw === 'string' &&
    maintenanceModeRaw.toLowerCase() === 'true';

  const marketOpenTimeRaw = config.MARKET_OPEN_TIME;
  const marketOpenTime =
    marketOpenTimeRaw === undefined || marketOpenTimeRaw === ''
      ? '09:15'
      : marketOpenTimeRaw;
  if (!isValidTimeOfDay(marketOpenTime)) {
    errors.push('MARKET_OPEN_TIME must be in HH:MM 24-hour format');
  }

  const marketCloseTimeRaw = config.MARKET_CLOSE_TIME;
  const marketCloseTime =
    marketCloseTimeRaw === undefined || marketCloseTimeRaw === ''
      ? '15:30'
      : marketCloseTimeRaw;
  if (!isValidTimeOfDay(marketCloseTime)) {
    errors.push('MARKET_CLOSE_TIME must be in HH:MM 24-hour format');
  }

  const jwtExpiresInRaw = config.JWT_EXPIRES_IN;
  const jwtExpiresIn =
    jwtExpiresInRaw === undefined || jwtExpiresInRaw === ''
      ? '1d'
      : (jwtExpiresInRaw as string);

  const paperInitialBalanceRaw = config.PAPER_TRADING_INITIAL_BALANCE;
  const paperTradingInitialBalance =
    paperInitialBalanceRaw === undefined || paperInitialBalanceRaw === ''
      ? 100_000
      : Number(paperInitialBalanceRaw);
  if (
    !Number.isFinite(paperTradingInitialBalance) ||
    paperTradingInitialBalance <= 0
  ) {
    errors.push('PAPER_TRADING_INITIAL_BALANCE must be a positive number');
  }

  // Comma-separated list of exact origins allowed by CORS (see
  // cors-origin.util.ts). In development, any http(s)://localhost:<port> or
  // 127.0.0.1:<port> origin is also allowed regardless of this value, since
  // Vite's dev port is not fixed — this default only ever matters as one
  // more explicitly-trusted entry, and is the only thing that matters in
  // production, where the localhost fallback never applies.
  const frontendUrlRaw = config.FRONTEND_URL;
  const frontendUrlProvided =
    typeof frontendUrlRaw === 'string' && frontendUrlRaw.trim() !== '';
  const frontendUrl = frontendUrlProvided
    ? frontendUrlRaw
    : 'http://localhost:5173';

  // Phase 20 hardening: the localhost default above exists purely so a
  // fresh local checkout boots without any .env edits — it must never
  // silently stand in for a real production frontend origin. Production
  // CORS (see cors-origin.util.ts) also permanently disables the
  // development-only localhost/127.0.0.1 fallback, so an unset/localhost
  // FRONTEND_URL in production would otherwise mean *no* origin is ever
  // trusted, silently breaking every browser request rather than failing
  // loudly at boot.
  if (nodeEnv === 'production') {
    if (!frontendUrlProvided) {
      errors.push(
        'FRONTEND_URL is required in production (no localhost default is used) — set it to the real frontend origin(s), comma-separated for more than one',
      );
    } else if (isLocalHost(frontendUrl)) {
      errors.push(
        'FRONTEND_URL must not be a localhost/127.0.0.1 origin in production',
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors.map((e) => ` - ${e}`).join('\n')}`,
    );
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    MONGODB_URI: config.MONGODB_URI as string,
    ANGEL_ONE_API_KEY: config.ANGEL_ONE_API_KEY as string,
    ANGEL_ONE_CLIENT_CODE: config.ANGEL_ONE_CLIENT_CODE as string,
    ANGEL_ONE_PASSWORD: config.ANGEL_ONE_PASSWORD as string,
    ANGEL_ONE_TOTP_SECRET: config.ANGEL_ONE_TOTP_SECRET as string,
    ANGEL_ONE_API_SECRET: config.ANGEL_ONE_API_SECRET as string,
    TOKEN_ENCRYPTION_KEY: config.TOKEN_ENCRYPTION_KEY as string,
    MARKET_DATA_PROVIDER:
      marketDataProvider as EnvironmentVariables['MARKET_DATA_PROVIDER'],
    INSTRUMENT_MASTER_PROVIDER:
      instrumentMasterProvider as EnvironmentVariables['INSTRUMENT_MASTER_PROVIDER'],
    TRADING_MODE: tradingMode as EnvironmentVariables['TRADING_MODE'],
    KILL_SWITCH_ENABLED: killSwitchEnabled,
    HEALTH_CHECK_INTERVAL_MS: healthCheckIntervalMs,
    HEARTBEAT_TIMEOUT_MS: heartbeatTimeoutMs,
    MAINTENANCE_MODE: maintenanceMode,
    MARKET_OPEN_TIME: marketOpenTime as string,
    MARKET_CLOSE_TIME: marketCloseTime as string,
    JWT_SECRET: config.JWT_SECRET as string,
    JWT_EXPIRES_IN: jwtExpiresIn,
    PAPER_TRADING_INITIAL_BALANCE: paperTradingInitialBalance,
    FRONTEND_URL: frontendUrl,
    EMAIL_PROVIDER: emailProvider as EnvironmentVariables['EMAIL_PROVIDER'],
    SMTP_HOST: (config.SMTP_HOST as string) ?? '',
    SMTP_PORT: smtpPort,
    SMTP_SECURE: smtpSecure,
    SMTP_USER: (config.SMTP_USER as string) ?? '',
    SMTP_PASS: (config.SMTP_PASS as string) ?? '',
    SMTP_FROM: effectiveSmtpFrom || ((config.SMTP_FROM as string) ?? ''),
    SMTP_FROM_NAME: smtpFromName,
    SMTP_VERIFIED_SENDER: smtpVerifiedSender,
    RESEND_API_KEY: (config.RESEND_API_KEY as string) ?? '',
    EMAIL_FROM: (config.EMAIL_FROM as string) ?? '',
    EMAIL_FROM_NAME: (config.EMAIL_FROM_NAME as string) ?? '',
  };
}
