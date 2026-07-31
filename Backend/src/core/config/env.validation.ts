export interface EnvironmentVariables {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  MONGODB_URI: string;
  DHAN_CLIENT_ID: string;
  DHAN_API_KEY: string;
  DHAN_ACCESS_TOKEN: string;
  DHAN_REST_URL: string;
  DHAN_WS_URL: string;
  TOKEN_ENCRYPTION_KEY: string;
  MARKET_DATA_PROVIDER: 'MOCK' | 'DHAN';
  INSTRUMENT_MASTER_PROVIDER: 'MOCK' | 'DHAN';
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
  EMAIL_PROVIDER: 'DEVELOPMENT' | 'GOOGLE';
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  GOOGLE_REDIRECT_URI: string;
  EMAIL_FROM: string;
  EMAIL_FROM_NAME: string;
  /** Persistent-disk mount path for the auto-bootstrapped TOKEN_ENCRYPTION_KEY file — see src/bootstrap/encryption-key-bootstrap.ts. Optional; only consulted when TOKEN_ENCRYPTION_KEY itself isn't set directly. */
  SECRETS_DIR: string;
  /** How often BrokerTokenRenewalScheduler proactively calls RenewToken while in LIVE mode, well inside the 24h token lifetime. Optional, sane default. */
  BROKER_TOKEN_RENEWAL_INTERVAL_MS: number;
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
//
// DHAN_API_KEY is deliberately NOT in this list. Per DhanHQ's official v2
// authentication docs (https://dhanhq.co/docs/v2/authentication/), an API
// key/secret is only needed for the OAuth "consent" flow used to *obtain* an
// access token for a partner app — it is never sent on, or required for, any
// actual REST/WebSocket call once a valid DHAN_ACCESS_TOKEN exists. The
// supported flow here is the simpler one: an operator generates a 24-hour
// access token manually in the Dhan web console (My Profile -> Access
// DhanHQ APIs) and supplies only DHAN_CLIENT_ID + DHAN_ACCESS_TOKEN.
// Requiring DHAN_API_KEY would incorrectly block that legitimate, documented
// path from ever reaching LIVE mode.
const LIVE_MODE_REQUIRED_STRING_KEYS: ReadonlyArray<
  keyof EnvironmentVariables
> = ['DHAN_CLIENT_ID', 'DHAN_ACCESS_TOKEN'];

const DEFAULT_DHAN_REST_URL = 'https://api.dhan.co/v2';
const DEFAULT_DHAN_WS_URL = 'wss://api-feed.dhan.co';

function isValidNodeEnv(
  value: unknown,
): value is EnvironmentVariables['NODE_ENV'] {
  return value === 'development' || value === 'production' || value === 'test';
}

function isValidMarketDataProvider(
  value: unknown,
): value is EnvironmentVariables['MARKET_DATA_PROVIDER'] {
  return value === 'MOCK' || value === 'DHAN';
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
  // from real Dhan data to both the operator and the frontend. Only the
  // *default* (unset) case is tied to TRADING_MODE; an explicit override
  // still wins either way, e.g. pointing a LIVE deployment's market data at
  // MOCK for a rehearsal remains possible if deliberately configured.
  const marketDataProviderRaw = config.MARKET_DATA_PROVIDER;
  const marketDataProvider =
    marketDataProviderRaw === undefined || marketDataProviderRaw === ''
      ? tradingMode === 'LIVE'
        ? 'DHAN'
        : 'MOCK'
      : marketDataProviderRaw;
  if (!isValidMarketDataProvider(marketDataProvider)) {
    errors.push('MARKET_DATA_PROVIDER must be either MOCK or DHAN');
  }

  const instrumentMasterProviderRaw = config.INSTRUMENT_MASTER_PROVIDER;
  const instrumentMasterProvider =
    instrumentMasterProviderRaw === undefined ||
    instrumentMasterProviderRaw === ''
      ? tradingMode === 'LIVE'
        ? 'DHAN'
        : 'MOCK'
      : instrumentMasterProviderRaw;
  if (!isValidMarketDataProvider(instrumentMasterProvider)) {
    errors.push('INSTRUMENT_MASTER_PROVIDER must be either MOCK or DHAN');
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
          `${key} looks like a placeholder value — TRADING_MODE=LIVE requires a real Dhan credential, not a placeholder`,
        );
      }
    }
  }

  // DHAN_REST_URL/DHAN_WS_URL default to Dhan's real documented v2 endpoints
  // — an operator only ever needs to override these for a sandbox/mock
  // Dhan-compatible endpoint, never for normal production use.
  const dhanRestUrlRaw = config.DHAN_REST_URL;
  const dhanRestUrl =
    typeof dhanRestUrlRaw === 'string' && dhanRestUrlRaw.trim() !== ''
      ? dhanRestUrlRaw.trim()
      : DEFAULT_DHAN_REST_URL;

  const dhanWsUrlRaw = config.DHAN_WS_URL;
  const dhanWsUrl =
    typeof dhanWsUrlRaw === 'string' && dhanWsUrlRaw.trim() !== ''
      ? dhanWsUrlRaw.trim()
      : DEFAULT_DHAN_WS_URL;

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
  if (emailProvider !== 'DEVELOPMENT' && emailProvider !== 'GOOGLE') {
    errors.push('EMAIL_PROVIDER must be either DEVELOPMENT or GOOGLE');
  }

  // Gmail API via OAuth2 (`GoogleMailProvider`) is the only real,
  // network-sending email provider in this codebase — SMTP and Resend have
  // been fully removed. `DEVELOPMENT` (in-memory, no network call) must
  // never be the *effective* provider once deployed for real users, so
  // production requires these regardless of what EMAIL_PROVIDER is set to
  // — see `selectEmailProvider`, which never selects DEVELOPMENT in
  // production either. This closes the exact misconfiguration class that
  // previously let a stale EMAIL_PROVIDER value silently keep the old
  // provider active after credentials for a new one were added: production
  // no longer depends on anyone remembering to flip a selector variable.
  const googleRequiredForSending =
    nodeEnv === 'production' || emailProvider === 'GOOGLE';
  if (googleRequiredForSending) {
    for (const key of [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REFRESH_TOKEN',
      'GOOGLE_REDIRECT_URI',
    ] as const) {
      const value = config[key];
      if (typeof value !== 'string' || value.trim() === '') {
        errors.push(
          `${key} is required to send email via the Gmail API (production always sends real email) and must be a non-empty string`,
        );
      } else if (nodeEnv === 'production' && looksLikePlaceholder(value)) {
        errors.push(
          `${key} looks like a placeholder value and must be replaced with a real credential in production`,
        );
      }
    }

    const emailFromRaw = config.EMAIL_FROM;
    if (
      typeof emailFromRaw !== 'string' ||
      emailFromRaw.trim() === '' ||
      !EMAIL_PATTERN.test(emailFromRaw.trim())
    ) {
      errors.push(
        'EMAIL_FROM is required to send email via the Gmail API and must be a valid email address',
      );
    }

    const emailFromNameRaw = config.EMAIL_FROM_NAME;
    if (
      typeof emailFromNameRaw !== 'string' ||
      emailFromNameRaw.trim() === ''
    ) {
      errors.push(
        'EMAIL_FROM_NAME is required to send email via the Gmail API and must be a non-empty string',
      );
    }
  }

  const secretsDirRaw = config.SECRETS_DIR;
  const secretsDir =
    typeof secretsDirRaw === 'string' ? secretsDirRaw.trim() : '';

  const brokerTokenRenewalIntervalRaw = config.BROKER_TOKEN_RENEWAL_INTERVAL_MS;
  const brokerTokenRenewalIntervalMs =
    brokerTokenRenewalIntervalRaw === undefined ||
    brokerTokenRenewalIntervalRaw === ''
      ? 6 * 60 * 60 * 1000
      : Number(brokerTokenRenewalIntervalRaw);
  if (
    !Number.isInteger(brokerTokenRenewalIntervalMs) ||
    brokerTokenRenewalIntervalMs <= 0
  ) {
    errors.push('BROKER_TOKEN_RENEWAL_INTERVAL_MS must be a positive integer');
  }

  // MARKET_DATA_PROVIDER/INSTRUMENT_MASTER_PROVIDER are deprecated: provider
  // selection now comes exclusively from TradingModeService's runtime mode
  // (PAPER always MOCK, LIVE always DHAN — never independently configurable,
  // which is what let the two disagree in the first place). Still accepted
  // here (shape-validated below, same as before) so an existing deployment's
  // env config never fails validation on upgrade; a startup warning is
  // logged separately (see config.service.ts) if either is explicitly set.
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
    DHAN_CLIENT_ID: (config.DHAN_CLIENT_ID as string) ?? '',
    DHAN_API_KEY: (config.DHAN_API_KEY as string) ?? '',
    DHAN_ACCESS_TOKEN: (config.DHAN_ACCESS_TOKEN as string) ?? '',
    DHAN_REST_URL: dhanRestUrl,
    DHAN_WS_URL: dhanWsUrl,
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
    GOOGLE_CLIENT_ID: (config.GOOGLE_CLIENT_ID as string) ?? '',
    GOOGLE_CLIENT_SECRET: (config.GOOGLE_CLIENT_SECRET as string) ?? '',
    GOOGLE_REFRESH_TOKEN: (config.GOOGLE_REFRESH_TOKEN as string) ?? '',
    GOOGLE_REDIRECT_URI: (config.GOOGLE_REDIRECT_URI as string) ?? '',
    EMAIL_FROM: (config.EMAIL_FROM as string) ?? '',
    EMAIL_FROM_NAME: (config.EMAIL_FROM_NAME as string) ?? '',
    SECRETS_DIR: secretsDir,
    BROKER_TOKEN_RENEWAL_INTERVAL_MS: brokerTokenRenewalIntervalMs,
  };
}
