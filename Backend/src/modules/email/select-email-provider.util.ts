import type { ConfigService } from '@core/config/config.service';
import type { LoggerService } from '@core/logger/logger.service';
import type { DevelopmentEmailProvider } from './providers/development-email.provider';
import type { SmtpEmailProvider } from './providers/smtp-email.provider';
import type { ResendEmailProvider } from './providers/resend-email.provider';
import type { IEmailProvider } from './interfaces/email-provider.interface';

export interface SelectedEmailProvider {
  readonly provider: IEmailProvider;
  readonly providerClassName: string;
}

/**
 * The single place `EMAIL_PROVIDER` is turned into a concrete
 * `IEmailProvider` instance — extracted as a pure function (same pattern as
 * `selectOrderExecutor` in the broker executors module) so it's directly
 * unit-testable without booting the full Nest DI graph, and so there is
 * exactly one switch statement to audit when diagnosing "why is the wrong
 * provider running" rather than duplicated inline logic.
 */
export function selectEmailProvider(
  configService: Pick<ConfigService, 'emailProvider'>,
  logger: Pick<LoggerService, 'log'>,
  development: DevelopmentEmailProvider,
  smtp: SmtpEmailProvider,
  resend: ResendEmailProvider,
): IEmailProvider {
  const selected = configService.emailProvider;
  logger.log(`EMAIL_PROVIDER = ${selected}`, 'EmailModule');

  const result: SelectedEmailProvider =
    selected === 'SMTP'
      ? { provider: smtp, providerClassName: 'SmtpEmailProvider' }
      : selected === 'RESEND'
        ? { provider: resend, providerClassName: 'ResendEmailProvider' }
        : {
            provider: development,
            providerClassName: 'DevelopmentEmailProvider',
          };

  logger.log(`Using ${result.providerClassName}`, 'EmailModule');
  return result.provider;
}
