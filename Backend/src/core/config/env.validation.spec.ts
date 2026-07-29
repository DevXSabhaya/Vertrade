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

/** A minimal, valid Gmail API (OAuth2) config. */
function googleConfig(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return baseConfig({
    EMAIL_PROVIDER: 'GOOGLE',
    GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'client-secret-value',
    GOOGLE_REFRESH_TOKEN: 'refresh-token-value',
    GOOGLE_REDIRECT_URI: 'https://developers.google.com/oauthplayground',
    EMAIL_FROM: 'vertrade19@gmail.com',
    EMAIL_FROM_NAME: 'Vertrade',
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

  it('defaults MARKET_DATA_PROVIDER and INSTRUMENT_MASTER_PROVIDER to ANGEL_ONE in LIVE mode — a flat MOCK default would let a live deployment silently trade/chart off synthetic data', () => {
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
    expect(env.MARKET_DATA_PROVIDER).toBe('ANGEL_ONE');
    expect(env.INSTRUMENT_MASTER_PROVIDER).toBe('ANGEL_ONE');
  });

  it('still honors an explicit MOCK override in LIVE mode (e.g. a rehearsal deployment)', () => {
    const env = validateEnv(
      baseConfig({
        TRADING_MODE: 'LIVE',
        MARKET_DATA_PROVIDER: 'MOCK',
        INSTRUMENT_MASTER_PROVIDER: 'MOCK',
        ANGEL_ONE_API_KEY: 'key',
        ANGEL_ONE_CLIENT_CODE: 'code',
        ANGEL_ONE_PASSWORD: 'pass',
        ANGEL_ONE_TOTP_SECRET: 'totp',
        ANGEL_ONE_API_SECRET: 'secret',
      }),
    );
    expect(env.MARKET_DATA_PROVIDER).toBe('MOCK');
    expect(env.INSTRUMENT_MASTER_PROVIDER).toBe('MOCK');
  });

  it('defaults EMAIL_PROVIDER to DEVELOPMENT and requires no Google credentials outside production', () => {
    const env = validateEnv(baseConfig());
    expect(env.EMAIL_PROVIDER).toBe('DEVELOPMENT');
  });

  it('rejects an invalid EMAIL_PROVIDER literal', () => {
    expect(() => validateEnv(baseConfig({ EMAIL_PROVIDER: 'SMTP' }))).toThrow(
      /EMAIL_PROVIDER must be either DEVELOPMENT or GOOGLE/,
    );
  });

  describe('EMAIL_PROVIDER=GOOGLE (Gmail API via OAuth2)', () => {
    it('fails to boot with EMAIL_PROVIDER=GOOGLE and missing Google OAuth2 config', () => {
      expect(() =>
        validateEnv(baseConfig({ EMAIL_PROVIDER: 'GOOGLE' })),
      ).toThrow(/GOOGLE_CLIENT_ID is required to send email via the Gmail API/);
    });

    it('boots with EMAIL_PROVIDER=GOOGLE when all Google OAuth2 config is present', () => {
      const env = validateEnv(googleConfig());
      expect(env.EMAIL_PROVIDER).toBe('GOOGLE');
      expect(env.GOOGLE_CLIENT_ID).toBe('client-id.apps.googleusercontent.com');
      expect(env.GOOGLE_CLIENT_SECRET).toBe('client-secret-value');
      expect(env.GOOGLE_REFRESH_TOKEN).toBe('refresh-token-value');
      expect(env.GOOGLE_REDIRECT_URI).toBe(
        'https://developers.google.com/oauthplayground',
      );
      expect(env.EMAIL_FROM).toBe('vertrade19@gmail.com');
      expect(env.EMAIL_FROM_NAME).toBe('Vertrade');
    });

    it('rejects a missing GOOGLE_CLIENT_SECRET', () => {
      expect(() =>
        validateEnv(googleConfig({ GOOGLE_CLIENT_SECRET: undefined })),
      ).toThrow(
        /GOOGLE_CLIENT_SECRET is required to send email via the Gmail API/,
      );
    });

    it('rejects a missing GOOGLE_REFRESH_TOKEN', () => {
      expect(() =>
        validateEnv(googleConfig({ GOOGLE_REFRESH_TOKEN: undefined })),
      ).toThrow(
        /GOOGLE_REFRESH_TOKEN is required to send email via the Gmail API/,
      );
    });

    it('rejects a missing GOOGLE_REDIRECT_URI', () => {
      expect(() =>
        validateEnv(googleConfig({ GOOGLE_REDIRECT_URI: undefined })),
      ).toThrow(
        /GOOGLE_REDIRECT_URI is required to send email via the Gmail API/,
      );
    });

    it('rejects an invalid EMAIL_FROM address', () => {
      expect(() =>
        validateEnv(googleConfig({ EMAIL_FROM: 'not-an-email' })),
      ).toThrow(/EMAIL_FROM is required to send email via the Gmail API/);
    });

    it('rejects a missing EMAIL_FROM_NAME', () => {
      expect(() =>
        validateEnv(googleConfig({ EMAIL_FROM_NAME: undefined })),
      ).toThrow(/EMAIL_FROM_NAME is required to send email via the Gmail API/);
    });

    it('rejects a placeholder-looking GOOGLE_CLIENT_SECRET in production', () => {
      expect(() =>
        validateEnv(
          googleConfig({
            NODE_ENV: 'production',
            GOOGLE_CLIENT_SECRET: 'your-client-secret-here',
            FRONTEND_URL: 'https://app.example.com',
            JWT_SECRET: 'a'.repeat(32),
            TOKEN_ENCRYPTION_KEY: 'a'.repeat(32),
          }),
        ),
      ).toThrow(/GOOGLE_CLIENT_SECRET looks like a placeholder value/);
    });
  });

  describe('production always sends via Gmail, regardless of EMAIL_PROVIDER', () => {
    it('requires Google OAuth2 config in production even when EMAIL_PROVIDER is unset', () => {
      expect(() =>
        validateEnv(
          baseConfig({
            NODE_ENV: 'production',
            FRONTEND_URL: 'https://app.example.com',
            JWT_SECRET: 'a'.repeat(32),
            TOKEN_ENCRYPTION_KEY: 'a'.repeat(32),
          }),
        ),
      ).toThrow(/GOOGLE_CLIENT_ID is required to send email via the Gmail API/);
    });

    it('requires Google OAuth2 config in production even when EMAIL_PROVIDER=DEVELOPMENT is explicitly set', () => {
      // Regression guard: production must never be able to boot in a state
      // where email silently doesn't send for real.
      expect(() =>
        validateEnv(
          baseConfig({
            NODE_ENV: 'production',
            EMAIL_PROVIDER: 'DEVELOPMENT',
            FRONTEND_URL: 'https://app.example.com',
            JWT_SECRET: 'a'.repeat(32),
            TOKEN_ENCRYPTION_KEY: 'a'.repeat(32),
          }),
        ),
      ).toThrow(/GOOGLE_CLIENT_ID is required to send email via the Gmail API/);
    });

    it('boots in production once Google OAuth2 config is present, regardless of EMAIL_PROVIDER', () => {
      const env = validateEnv(
        googleConfig({
          NODE_ENV: 'production',
          EMAIL_PROVIDER: undefined,
          MONGODB_URI: 'mongodb+srv://prod-cluster.example.com/trading-app',
          FRONTEND_URL: 'https://app.example.com',
          JWT_SECRET: 'a'.repeat(32),
          TOKEN_ENCRYPTION_KEY: 'a'.repeat(32),
        }),
      );
      expect(env.NODE_ENV).toBe('production');
      expect(env.EMAIL_PROVIDER).toBe('DEVELOPMENT');
    });

    it('does not require Google OAuth2 config outside production when EMAIL_PROVIDER is unset', () => {
      expect(() => validateEnv(baseConfig())).not.toThrow();
    });
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
        googleConfig({
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
