import { validateEnv } from './env.validation';

function baseConfig(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    MONGODB_URI: 'mongodb://localhost:27017/test',
    TOKEN_ENCRYPTION_KEY: 'a'.repeat(32),
    JWT_SECRET: 'jwt-secret',
    ...overrides,
  };
}

/** A minimal, internally-consistent SMTP config: SMTP_FROM equals SMTP_USER (the default-allowed case), SMTP_FROM_NAME set. */
function smtpConfig(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return baseConfig({
    EMAIL_PROVIDER: 'SMTP',
    SMTP_HOST: 'smtp.example.com',
    SMTP_USER: 'user@example.com',
    SMTP_PASS: 'pass',
    SMTP_FROM: 'user@example.com',
    SMTP_FROM_NAME: 'Trading App',
    ...overrides,
  });
}

describe('validateEnv', () => {
  it('boots successfully in PAPER mode with no Angel One credentials set', () => {
    const env = validateEnv(baseConfig({ TRADING_MODE: 'PAPER' }));
    expect(env.TRADING_MODE).toBe('PAPER');
    expect(env.ANGEL_ONE_API_KEY).toBeUndefined();
  });

  it('defaults to PAPER mode when TRADING_MODE is unset', () => {
    const env = validateEnv(baseConfig());
    expect(env.TRADING_MODE).toBe('PAPER');
  });

  it('fails to boot in LIVE mode without Angel One credentials', () => {
    expect(() => validateEnv(baseConfig({ TRADING_MODE: 'LIVE' }))).toThrow(
      /ANGEL_ONE_API_KEY is required when TRADING_MODE=LIVE/,
    );
  });

  it('boots successfully in LIVE mode when all Angel One credentials are set', () => {
    const env = validateEnv(
      baseConfig({
        TRADING_MODE: 'LIVE',
        ANGEL_ONE_API_KEY: 'key',
        ANGEL_ONE_CLIENT_CODE: 'code',
        ANGEL_ONE_PASSWORD: 'pass',
        ANGEL_ONE_TOTP_SECRET: 'totp',
        ANGEL_ONE_API_SECRET: 'secret',
      }),
    );
    expect(env.TRADING_MODE).toBe('LIVE');
  });

  it('defaults INSTRUMENT_MASTER_PROVIDER to MOCK', () => {
    const env = validateEnv(baseConfig());
    expect(env.INSTRUMENT_MASTER_PROVIDER).toBe('MOCK');
  });

  it('rejects an invalid INSTRUMENT_MASTER_PROVIDER value', () => {
    expect(() =>
      validateEnv(baseConfig({ INSTRUMENT_MASTER_PROVIDER: 'NOT_REAL' })),
    ).toThrow(/INSTRUMENT_MASTER_PROVIDER must be either MOCK or ANGEL_ONE/);
  });

  it('defaults EMAIL_PROVIDER to DEVELOPMENT and requires no SMTP config', () => {
    const env = validateEnv(baseConfig());
    expect(env.EMAIL_PROVIDER).toBe('DEVELOPMENT');
  });

  it('fails to boot with EMAIL_PROVIDER=SMTP and missing SMTP config', () => {
    expect(() => validateEnv(baseConfig({ EMAIL_PROVIDER: 'SMTP' }))).toThrow(
      /SMTP_HOST is required when EMAIL_PROVIDER=SMTP/,
    );
  });

  it('boots with EMAIL_PROVIDER=SMTP when all SMTP config is present', () => {
    const env = validateEnv(smtpConfig());
    expect(env.EMAIL_PROVIDER).toBe('SMTP');
    expect(env.SMTP_PORT).toBe(587);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.SMTP_FROM).toBe('user@example.com');
  });

  it('defaults SMTP_SECURE to true for port 465 and false otherwise', () => {
    const secure465 = validateEnv(smtpConfig({ SMTP_PORT: '465' }));
    expect(secure465.SMTP_SECURE).toBe(true);
  });

  it('rejects SMTP_PORT=465 with SMTP_SECURE=false', () => {
    expect(() =>
      validateEnv(smtpConfig({ SMTP_PORT: '465', SMTP_SECURE: 'false' })),
    ).toThrow(/SMTP_SECURE=false is invalid with SMTP_PORT=465/);
  });

  it('rejects SMTP_PORT=587 with SMTP_SECURE=true', () => {
    expect(() =>
      validateEnv(smtpConfig({ SMTP_PORT: '587', SMTP_SECURE: 'true' })),
    ).toThrow(/SMTP_SECURE=true is invalid with SMTP_PORT=587/);
  });

  it('rejects a non-boolean SMTP_SECURE value', () => {
    expect(() => validateEnv(baseConfig({ SMTP_SECURE: 'yes' }))).toThrow(
      /SMTP_SECURE must be either "true" or "false"/,
    );
  });

  it('fails to boot with EMAIL_PROVIDER=SMTP and no SMTP_FROM_NAME', () => {
    expect(() =>
      validateEnv(smtpConfig({ SMTP_FROM_NAME: undefined })),
    ).toThrow(/SMTP_FROM_NAME is required when EMAIL_PROVIDER=SMTP/);
  });

  it('rejects an invalid SMTP_FROM email address', () => {
    expect(() =>
      validateEnv(smtpConfig({ SMTP_FROM: 'not-an-email' })),
    ).toThrow(/SMTP_FROM must be a valid email address/);
  });

  it('rejects an invalid SMTP_USER email address', () => {
    expect(() =>
      validateEnv(
        smtpConfig({ SMTP_USER: 'not-an-email', SMTP_FROM: 'not-an-email' }),
      ),
    ).toThrow(/SMTP_USER must be a valid email address/);
  });

  it('boots with EMAIL_PROVIDER=SMTP when SMTP_FROM and SMTP_FROM_NAME are both valid', () => {
    const env = validateEnv(smtpConfig());
    expect(env.SMTP_FROM).toBe('user@example.com');
    expect(env.SMTP_FROM_NAME).toBe('Trading App');
  });

  it('falls back to SMTP_USER as SMTP_FROM when SMTP_FROM is not set', () => {
    const env = validateEnv(
      smtpConfig({ SMTP_USER: 'user@example.com', SMTP_FROM: undefined }),
    );
    expect(env.SMTP_FROM).toBe('user@example.com');
  });

  it('fails to boot when SMTP_FROM is unset and SMTP_USER is not a valid email to fall back to', () => {
    expect(() =>
      validateEnv(
        smtpConfig({ SMTP_USER: 'not-an-email', SMTP_FROM: undefined }),
      ),
    ).toThrow(
      /SMTP_USER must be a valid email address to use as the SMTP_FROM fallback/,
    );
  });

  it('rejects SMTP_FROM that differs from SMTP_USER when SMTP_VERIFIED_SENDER is not set', () => {
    expect(() =>
      validateEnv(
        smtpConfig({
          SMTP_USER: 'user@example.com',
          SMTP_FROM: 'marketing@example.com',
        }),
      ),
    ).toThrow(
      /SMTP_FROM must equal SMTP_USER unless SMTP_VERIFIED_SENDER=true/,
    );
  });

  it('allows SMTP_FROM to differ from SMTP_USER when SMTP_VERIFIED_SENDER=true', () => {
    const env = validateEnv(
      smtpConfig({
        SMTP_USER: 'user@example.com',
        SMTP_FROM: 'marketing@example.com',
        SMTP_VERIFIED_SENDER: 'true',
      }),
    );
    expect(env.SMTP_FROM).toBe('marketing@example.com');
    expect(env.SMTP_VERIFIED_SENDER).toBe(true);
  });

  it('defaults SMTP_VERIFIED_SENDER to false', () => {
    const env = validateEnv(smtpConfig());
    expect(env.SMTP_VERIFIED_SENDER).toBe(false);
  });
});
