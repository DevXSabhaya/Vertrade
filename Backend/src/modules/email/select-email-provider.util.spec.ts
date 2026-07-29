import { selectEmailProvider } from './select-email-provider.util';
import type { LoggerService } from '@core/logger/logger.service';
import type { DevelopmentEmailProvider } from './providers/development-email.provider';
import type { GoogleMailProvider } from './providers/google-mail.provider';

function makeLogger(): jest.Mocked<Pick<LoggerService, 'log'>> {
  return { log: jest.fn() };
}

describe('selectEmailProvider', () => {
  const development = {
    marker: 'DEVELOPMENT',
  } as unknown as DevelopmentEmailProvider;
  const google = { marker: 'GOOGLE' } as unknown as GoogleMailProvider;

  it('selects GoogleMailProvider when EMAIL_PROVIDER=GOOGLE outside production', () => {
    const logger = makeLogger();
    const selected = selectEmailProvider(
      { emailProvider: 'GOOGLE', isProduction: false },
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
      'Using GoogleMailProvider',
      'EmailModule',
    );
  });

  it('selects DevelopmentEmailProvider when EMAIL_PROVIDER=DEVELOPMENT outside production', () => {
    const logger = makeLogger();
    const selected = selectEmailProvider(
      { emailProvider: 'DEVELOPMENT', isProduction: false },
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
      { emailProvider: 'DEVELOPMENT', isProduction: true },
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
      { emailProvider: 'DEVELOPMENT', isProduction: true },
      logger,
      development,
      google,
    );

    expect(selected).toBe(google);
  });

  it('logs the effective-provider override line only when it differs from the configured value', () => {
    const logger = makeLogger();
    selectEmailProvider(
      { emailProvider: 'DEVELOPMENT', isProduction: true },
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
      { emailProvider: 'GOOGLE', isProduction: true },
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
});
