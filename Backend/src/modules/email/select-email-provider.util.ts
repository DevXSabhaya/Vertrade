import type { ConfigService } from '@core/config/config.service';
import type { LoggerService } from '@core/logger/logger.service';
import { maskSecret } from '@shared/security/mask-secret.util';
import type { DevelopmentEmailProvider } from './providers/development-email.provider';
import type { GoogleMailProvider } from './providers/google-mail.provider';
import type { IEmailProvider } from './interfaces/email-provider.interface';

export interface SelectedEmailProvider {
  readonly provider: IEmailProvider;
  readonly providerClassName: string;
}

type SelectEmailProviderConfigService = Pick<
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
 * `isProduction` is derived from `NODE_ENV` — if Render's dashboard never
 * had `NODE_ENV=production` set (Render does NOT set this automatically),
 * this function has no way to know it's running in production and will
 * fall back to whatever `EMAIL_PROVIDER` says (defaulting to
 * `DevelopmentEmailProvider`, which "succeeds" without ever sending real
 * email). The `resolved_node_env`/`is_production` fields logged below exist
 * specifically so that failure mode is visible from logs instead of
 * silently producing a fake success.
 *
 * Outside production, `EMAIL_PROVIDER=GOOGLE` opts into sending real email
 * locally (e.g. to manually verify a template against the real Gmail
 * account); anything else (including unset) defaults to
 * `DevelopmentEmailProvider`, which never makes a network call.
 */
export function selectEmailProvider(
  configService: SelectEmailProviderConfigService,
  logger: Pick<LoggerService, 'log'>,
  development: DevelopmentEmailProvider,
  google: GoogleMailProvider,
): IEmailProvider {
  const configured = configService.emailProvider;
  const effective = configService.isProduction ? 'GOOGLE' : configured;

  // Requirement: print every email-related environment variable at
  // startup, with every secret masked (never the raw value). Logged before
  // any selection decision is made, so this is visible even if selection
  // itself throws.
  logger.log(
    JSON.stringify({
      event: 'email_environment_snapshot',
      NODE_ENV: configService.nodeEnv,
      isProduction: configService.isProduction,
      EMAIL_PROVIDER: configured,
      EMAIL_FROM: configService.emailFrom || '(empty)',
      EMAIL_FROM_NAME: configService.emailFromName || '(empty)',
      GOOGLE_CLIENT_ID: maskSecret(configService.googleClientId),
      GOOGLE_CLIENT_SECRET: maskSecret(configService.googleClientSecret),
      GOOGLE_REFRESH_TOKEN: maskSecret(configService.googleRefreshToken),
      GOOGLE_REDIRECT_URI: configService.googleRedirectUri || '(empty)',
    }),
    'EmailModule',
  );

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

  // Exact strings requested for grep-ability in Render logs.
  logger.log(`Selected Email Provider: ${effective}`, 'EmailModule');
  logger.log(`Using ${result.providerClassName}`, 'EmailModule');
  logger.log(
    JSON.stringify({
      event: 'email_provider_dependency_injection_verified',
      developmentProviderInjected: development !== undefined,
      googleProviderInjected: google !== undefined,
      selectedProviderClassName: result.providerClassName,
    }),
    'EmailModule',
  );

  return result.provider;
}
