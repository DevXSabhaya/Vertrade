import { selectEmailProvider } from './select-email-provider.util';
import type { LoggerService } from '@core/logger/logger.service';
import type { DevelopmentEmailProvider } from './providers/development-email.provider';
import type { SmtpEmailProvider } from './providers/smtp-email.provider';
import type { ResendEmailProvider } from './providers/resend-email.provider';

function makeLogger(): jest.Mocked<Pick<LoggerService, 'log'>> {
  return { log: jest.fn() };
}

describe('selectEmailProvider', () => {
  const development = {
    marker: 'DEVELOPMENT',
  } as unknown as DevelopmentEmailProvider;
  const smtp = { marker: 'SMTP' } as unknown as SmtpEmailProvider;
  const resend = { marker: 'RESEND' } as unknown as ResendEmailProvider;

  it('selects ResendEmailProvider when EMAIL_PROVIDER=RESEND', () => {
    const logger = makeLogger();
    const selected = selectEmailProvider(
      { emailProvider: 'RESEND' },
      logger,
      development,
      smtp,
      resend,
    );

    expect(selected).toBe(resend);
    expect(logger.log).toHaveBeenCalledWith(
      'EMAIL_PROVIDER = RESEND',
      'EmailModule',
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Using ResendEmailProvider',
      'EmailModule',
    );
  });

  it('selects SmtpEmailProvider when EMAIL_PROVIDER=SMTP', () => {
    const logger = makeLogger();
    const selected = selectEmailProvider(
      { emailProvider: 'SMTP' },
      logger,
      development,
      smtp,
      resend,
    );

    expect(selected).toBe(smtp);
    expect(logger.log).toHaveBeenCalledWith(
      'Using SmtpEmailProvider',
      'EmailModule',
    );
  });

  it('selects DevelopmentEmailProvider when EMAIL_PROVIDER=DEVELOPMENT', () => {
    const logger = makeLogger();
    const selected = selectEmailProvider(
      { emailProvider: 'DEVELOPMENT' },
      logger,
      development,
      smtp,
      resend,
    );

    expect(selected).toBe(development);
    expect(logger.log).toHaveBeenCalledWith(
      'Using DevelopmentEmailProvider',
      'EmailModule',
    );
  });

  it('never selects SmtpEmailProvider when EMAIL_PROVIDER=RESEND, even if SMTP config also happens to be present', () => {
    // Regression guard: proves selection depends only on EMAIL_PROVIDER's
    // resolved value, never on which credentials happen to be configured
    // alongside it.
    const logger = makeLogger();
    const selected = selectEmailProvider(
      { emailProvider: 'RESEND' },
      logger,
      development,
      smtp,
      resend,
    );

    expect(selected).not.toBe(smtp);
    expect(selected).toBe(resend);
  });
});
