import { selectEmailProvider } from './select-email-provider.util';
import type { ConfigService } from '@core/config/config.service';
import type { LoggerService } from '@core/logger/logger.service';
import type { DevelopmentEmailProvider } from './providers/development-email.provider';
import type { GoogleMailProvider } from './providers/google-mail.provider';

function makeLogger(): jest.Mocked<Pick<LoggerService, 'log'>> {
  return { log: jest.fn() };
}

function makeConfigService(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    emailProvider: 'DEVELOPMENT',
    isProduction: false,
    nodeEnv: 'development',
    emailFrom: 'vertrade19@gmail.com',
    emailFromName: 'Vertrade',
    googleClientId: 'client-id',
    googleClientSecret: 'client-secret',
    googleRefreshToken: 'refresh-token',
    googleRedirectUri: 'https://developers.google.com/oauthplayground',
    ...overrides,
  } as unknown as Pick<
    ConfigService,
    | 'emailProvider'
    | 'isProduction'
    | 'nodeEnv'
    | 'emailFrom'
    | 'emailFromName'
    | 'googleClientId'
    | 'googleClientSecret'
    | 'googleRefreshToken'
    | 'googleRedirectUri'
  >;
}

describe('selectEmailProvider', () => {
  const development = {
    marker: 'DEVELOPMENT',
  } as unknown as DevelopmentEmailProvider;
  const google = { marker: 'GOOGLE' } as unknown as GoogleMailProvider;

  it('selects GoogleMailProvider when EMAIL_PROVIDER=GOOGLE outside production', () => {
    const logger = makeLogger();
    const selected = selectEmailProvider(
      makeConfigService({ emailProvider: 'GOOGLE', isProduction: false }),
      logger,
      development,
      google,
    );

    expect(selected).toBe(google);
    expect(logger.log).toHaveBeenCalledWith(
      'EMAIL_PROVIDER = GOOGLE',
      'EmailModule',
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Selected Email Provider: GOOGLE',
      'EmailModule',
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Using GoogleMailProvider',
      'EmailModule',
    );
  });

  it('selects DevelopmentEmailProvider when EMAIL_PROVIDER=DEVELOPMENT outside production', () => {
    const logger = makeLogger();
    const selected = selectEmailProvider(
      makeConfigService({ emailProvider: 'DEVELOPMENT', isProduction: false }),
      logger,
      development,
      google,
    );

    expect(selected).toBe(development);
    expect(logger.log).toHaveBeenCalledWith(
      'Using DevelopmentEmailProvider',
      'EmailModule',
    );
  });

  it('always selects GoogleMailProvider in production, even when EMAIL_PROVIDER=DEVELOPMENT', () => {
    // Regression guard for the exact class of bug that let a stale
    // EMAIL_PROVIDER value silently keep the old provider active in a
    // previous migration: production never consults EMAIL_PROVIDER at all.
    const logger = makeLogger();
    const selected = selectEmailProvider(
      makeConfigService({ emailProvider: 'DEVELOPMENT', isProduction: true }),
      logger,
      development,
      google,
    );

    expect(selected).toBe(google);
    expect(logger.log).toHaveBeenCalledWith(
      'Using GoogleMailProvider',
      'EmailModule',
    );
  });

  it('always selects GoogleMailProvider in production when EMAIL_PROVIDER is unset', () => {
    const logger = makeLogger();
    const selected = selectEmailProvider(
      makeConfigService({ emailProvider: 'DEVELOPMENT', isProduction: true }),
      logger,
      development,
      google,
    );

    expect(selected).toBe(google);
  });

  it('logs the effective-provider override line only when it differs from the configured value', () => {
    const logger = makeLogger();
    selectEmailProvider(
      makeConfigService({ emailProvider: 'DEVELOPMENT', isProduction: true }),
      logger,
      development,
      google,
    );

    expect(logger.log).toHaveBeenCalledWith(
      'Effective provider = GOOGLE (production always sends via Gmail)',
      'EmailModule',
    );
  });

  it('never logs the override line when the configured and effective provider already match', () => {
    const logger = makeLogger();
    selectEmailProvider(
      makeConfigService({ emailProvider: 'GOOGLE', isProduction: true }),
      logger,
      development,
      google,
    );

    const calls = logger.log.mock.calls.map(
      ([message]: [string, string?]) => message,
    );
    expect(
      calls.some((message) => message.includes('Effective provider')),
    ).toBe(false);
  });

  it('logs a masked environment snapshot before selecting a provider, never the raw secrets', () => {
    const logger = makeLogger();
    selectEmailProvider(
      makeConfigService({
        googleClientSecret: 'super-secret-value',
        googleRefreshToken: 'super-secret-refresh-token',
      }),
      logger,
      development,
      google,
    );

    const calls = logger.log.mock.calls.map(
      ([message]: [string, string?]) => message,
    );
    const snapshotMessage = calls.find((message) =>
      message.includes('email_environment_snapshot'),
    );
    expect(snapshotMessage).toBeDefined();
    const snapshot = JSON.parse(snapshotMessage as string) as Record<
      string,
      unknown
    >;
    expect(snapshot.GOOGLE_CLIENT_SECRET).not.toBe('super-secret-value');
    expect(snapshot.GOOGLE_REFRESH_TOKEN).not.toBe(
      'super-secret-refresh-token',
    );
    expect(snapshotMessage).not.toContain('super-secret-value');
    expect(snapshotMessage).not.toContain('super-secret-refresh-token');
    expect(snapshot.NODE_ENV).toBe('development');
    expect(snapshot.EMAIL_FROM).toBe('vertrade19@gmail.com');
  });

  it('logs dependency-injection verification with both providers confirmed present', () => {
    const logger = makeLogger();
    selectEmailProvider(makeConfigService(), logger, development, google);

    const calls = logger.log.mock.calls.map(
      ([message]: [string, string?]) => message,
    );
    const diMessage = calls.find((message) =>
      message.includes('email_provider_dependency_injection_verified'),
    );
    expect(diMessage).toBeDefined();
    const di = JSON.parse(diMessage as string) as Record<string, unknown>;
    expect(di.developmentProviderInjected).toBe(true);
    expect(di.googleProviderInjected).toBe(true);
  });
});
