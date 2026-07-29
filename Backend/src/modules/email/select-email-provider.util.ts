import type { ConfigService } from '@core/config/config.service';
import type { LoggerService } from '@core/logger/logger.service';
import type { DevelopmentEmailProvider } from './providers/development-email.provider';
import type { GoogleMailProvider } from './providers/google-mail.provider';
import type { IEmailProvider } from './interfaces/email-provider.interface';

export interface SelectedEmailProvider {
  readonly provider: IEmailProvider;
  readonly providerClassName: string;
}

/**
 * The single place email-provider selection happens — extracted as a pure
 * function (same pattern as `selectOrderExecutor` in the broker executors
 * module) so it's directly unit-testable without booting the full Nest DI
 * graph.
 *
 * Production always sends real email via `GoogleMailProvider`, regardless
 * of `EMAIL_PROVIDER` — `env.validation.ts` enforces the Google OAuth2
 * credentials are present whenever `isProduction` is true, and this
 * function never lets `DevelopmentEmailProvider` (in-memory, no real
 * delivery) be selected in production. This closes the exact
 * misconfiguration class that previously let a stale `EMAIL_PROVIDER` value
 * silently keep an old provider active after new credentials were added —
 * production no longer depends on anyone remembering to flip a selector
 * variable at all.
 *
 * Outside production, `EMAIL_PROVIDER=GOOGLE` opts into sending real email
 * locally (e.g. to manually verify a template against the real Gmail
 * account); anything else (including unset) defaults to
 * `DevelopmentEmailProvider`, which never makes a network call.
 */
export function selectEmailProvider(
  configService: Pick<ConfigService, 'emailProvider' | 'isProduction'>,
  logger: Pick<LoggerService, 'log'>,
  development: DevelopmentEmailProvider,
  google: GoogleMailProvider,
): IEmailProvider {
  const configured = configService.emailProvider;
  const effective = configService.isProduction ? 'GOOGLE' : configured;

  logger.log(`EMAIL_PROVIDER = ${configured}`, 'EmailModule');
  if (effective !== configured) {
    logger.log(
      `Effective provider = ${effective} (production always sends via Gmail)`,
      'EmailModule',
    );
  }

  const result: SelectedEmailProvider =
    effective === 'GOOGLE'
      ? { provider: google, providerClassName: 'GoogleMailProvider' }
      : {
          provider: development,
          providerClassName: 'DevelopmentEmailProvider',
        };

  logger.log(`Using ${result.providerClassName}`, 'EmailModule');
  return result.provider;
}
