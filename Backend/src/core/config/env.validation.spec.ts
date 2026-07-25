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

  describe('Phase 20 hardening — secret strength/placeholder rejection in production', () => {
    it('rejects a short JWT_SECRET in production, even though it would pass in development', () => {
      expect(() =>
        validateEnv(
          baseConfig({ NODE_ENV: 'production', JWT_SECRET: 'short' }),
        ),
      ).toThrow(/JWT_SECRET must be at least 32 characters in production/);

      // The exact same value boots fine outside production.
      expect(() =>
        validateEnv(baseConfig({ JWT_SECRET: 'short' })),
      ).not.toThrow();
    });

    it('rejects a short TOKEN_ENCRYPTION_KEY in production', () => {
      expect(() =>
        validateEnv(
          baseConfig({
            NODE_ENV: 'production',
            JWT_SECRET: 'a'.repeat(32),
            TOKEN_ENCRYPTION_KEY: 'short',
          }),
        ),
      ).toThrow(
        /TOKEN_ENCRYPTION_KEY must be at least 32 characters in production/,
      );
    });

    it('rejects a placeholder-shaped JWT_SECRET in production even if it is long enough', () => {
      expect(() =>
        validateEnv(
          baseConfig({
            NODE_ENV: 'production',
            JWT_SECRET: 'change-me-please-change-me-please',
            TOKEN_ENCRYPTION_KEY: 'a'.repeat(32),
          }),
        ),
      ).toThrow(/JWT_SECRET looks like a placeholder value/);
    });

    it('accepts a long, non-placeholder JWT_SECRET/TOKEN_ENCRYPTION_KEY in production', () => {
      const env = validateEnv(
        baseConfig({
          NODE_ENV: 'production',
          JWT_SECRET: 'k7Rp2mQ9vLx4Nz8Wc3Ft6Bj1Ys5Hd0Ae7Ug4Io2Pk9M',
          TOKEN_ENCRYPTION_KEY: 'a9Kd3Fh7Jm1Lp5Qs8Tv2Wy6Za0Bc4Ef8Gi1Kn5Or9Uq',
          MONGODB_URI: 'mongodb+srv://prod-cluster.example.com/trading-app',
          FRONTEND_URL: 'https://app.example.com',
        }),
      );
      expect(env.NODE_ENV).toBe('production');
    });

    it('rejects a localhost MONGODB_URI in production', () => {
      expect(() =>
        validateEnv(
          baseConfig({
            NODE_ENV: 'production',
            JWT_SECRET: 'k7Rp2mQ9vLx4Nz8Wc3Ft6Bj1Ys5Hd0Ae7Ug4Io2Pk9M',
            TOKEN_ENCRYPTION_KEY: 'a9Kd3Fh7Jm1Lp5Qs8Tv2Wy6Za0Bc4Ef8Gi1Kn5Or9Uq',
            MONGODB_URI: 'mongodb://localhost:27017/trading-app',
            FRONTEND_URL: 'https://app.example.com',
          }),
        ),
      ).toThrow(/MONGODB_URI must not point at localhost/);
    });

    it('allows a localhost MONGODB_URI outside production', () => {
      expect(() =>
        validateEnv(
          baseConfig({ MONGODB_URI: 'mongodb://localhost:27017/dev' }),
        ),
      ).not.toThrow();
    });
  });

  describe('Phase 20 hardening — FRONTEND_URL required and non-localhost in production', () => {
    it('rejects an unset FRONTEND_URL in production (no silent localhost default)', () => {
      expect(() =>
        validateEnv(
          baseConfig({
            NODE_ENV: 'production',
            JWT_SECRET: 'k7Rp2mQ9vLx4Nz8Wc3Ft6Bj1Ys5Hd0Ae7Ug4Io2Pk9M',
            TOKEN_ENCRYPTION_KEY: 'a9Kd3Fh7Jm1Lp5Qs8Tv2Wy6Za0Bc4Ef8Gi1Kn5Or9Uq',
            MONGODB_URI: 'mongodb+srv://prod-cluster.example.com/trading-app',
          }),
        ),
      ).toThrow(/FRONTEND_URL is required in production/);
    });

    it('rejects a localhost FRONTEND_URL in production', () => {
      expect(() =>
        validateEnv(
          baseConfig({
            NODE_ENV: 'production',
            JWT_SECRET: 'k7Rp2mQ9vLx4Nz8Wc3Ft6Bj1Ys5Hd0Ae7Ug4Io2Pk9M',
            TOKEN_ENCRYPTION_KEY: 'a9Kd3Fh7Jm1Lp5Qs8Tv2Wy6Za0Bc4Ef8Gi1Kn5Or9Uq',
            MONGODB_URI: 'mongodb+srv://prod-cluster.example.com/trading-app',
            FRONTEND_URL: 'http://localhost:5173',
          }),
        ),
      ).toThrow(/FRONTEND_URL must not be a localhost\/127\.0\.0\.1 origin/);
    });

    it('defaults to localhost outside production without error', () => {
      const env = validateEnv(baseConfig());
      expect(env.FRONTEND_URL).toBe('http://localhost:5173');
    });
  });

  describe('Phase 21 hardening — LIVE mode rejects placeholder broker credentials', () => {
    function liveConfig(overrides: Record<string, unknown> = {}) {
      return baseConfig({
        TRADING_MODE: 'LIVE',
        ANGEL_ONE_API_KEY: 'real-api-key-abc123',
        ANGEL_ONE_CLIENT_CODE: 'real-client-code',
        ANGEL_ONE_PASSWORD: 'real-password',
        ANGEL_ONE_TOTP_SECRET: 'JBSWY3DPEHPK3PXP',
        ANGEL_ONE_API_SECRET: 'real-api-secret-xyz789',
        ...overrides,
      });
    }

    it("rejects a placeholder ANGEL_ONE_API_KEY (exactly this repo's own .env.example shape)", () => {
      expect(() =>
        validateEnv(liveConfig({ ANGEL_ONE_API_KEY: 'placeholder-api-key' })),
      ).toThrow(/ANGEL_ONE_API_KEY looks like a placeholder value/);
    });

    it('rejects a "changeme"-shaped ANGEL_ONE_PASSWORD', () => {
      expect(() =>
        validateEnv(liveConfig({ ANGEL_ONE_PASSWORD: 'changeme123' })),
      ).toThrow(/ANGEL_ONE_PASSWORD looks like a placeholder value/);
    });

    it('rejects a "your-..."-shaped ANGEL_ONE_CLIENT_CODE', () => {
      expect(() =>
        validateEnv(
          liveConfig({ ANGEL_ONE_CLIENT_CODE: 'your-client-code-here' }),
        ),
      ).toThrow(/ANGEL_ONE_CLIENT_CODE looks like a placeholder value/);
    });

    it('boots successfully in LIVE mode with real-looking credentials', () => {
      const env = validateEnv(liveConfig());
      expect(env.TRADING_MODE).toBe('LIVE');
    });

    it('placeholder rejection applies even outside production — LIVE mode is dangerous regardless of NODE_ENV', () => {
      expect(() =>
        validateEnv(
          liveConfig({
            NODE_ENV: 'development',
            ANGEL_ONE_API_SECRET: 'placeholder-api-secret',
          }),
        ),
      ).toThrow(/ANGEL_ONE_API_SECRET looks like a placeholder value/);
    });
  });
});
