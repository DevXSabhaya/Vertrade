import { Module } from '@nestjs/common';
import { ConfigModule } from '@core/config/config.module';
import { ConfigService } from '@core/config/config.service';
import { LoggerService } from '@core/logger/logger.service';
import { EMAIL_PROVIDER } from './email.constants';
import { DevelopmentEmailProvider } from './providers/development-email.provider';
import { SmtpEmailProvider } from './providers/smtp-email.provider';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { selectEmailProvider } from './select-email-provider.util';
import type { IEmailProvider } from './interfaces/email-provider.interface';

/**
 * Selects the `IEmailProvider` implementation purely from `EMAIL_PROVIDER`
 * (validated in `env.validation.ts`), mirroring the same
 * env-var-driven-factory pattern `MarketDataModule` already uses for
 * MOCK vs ANGEL_ONE. DEVELOPMENT is the safe default — it never makes a
 * network call and requires no credentials. SMTP is kept fully intact
 * (selectable via `EMAIL_PROVIDER=SMTP`) alongside RESEND
 * (`EMAIL_PROVIDER=RESEND`) so switching back never requires a code change,
 * only an env var.
 *
 * Logs the resolved `EMAIL_PROVIDER` value and the concrete class it
 * selected on every boot, unconditionally (not just when an email is sent)
 * — this is the single place selection happens, so if these two lines don't
 * say what you expect, the env var itself (as this specific deployment
 * actually received it — check for a stale deploy, wrong Render service, or
 * a typo/trailing-whitespace in the dashboard value) is the next thing to
 * check, not this code.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    DevelopmentEmailProvider,
    SmtpEmailProvider,
    ResendEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      useFactory: (
        configService: ConfigService,
        logger: LoggerService,
        development: DevelopmentEmailProvider,
        smtp: SmtpEmailProvider,
        resend: ResendEmailProvider,
      ): IEmailProvider =>
        selectEmailProvider(configService, logger, development, smtp, resend),
      inject: [
        ConfigService,
        LoggerService,
        DevelopmentEmailProvider,
        SmtpEmailProvider,
        ResendEmailProvider,
      ],
    },
  ],
  exports: [EMAIL_PROVIDER, DevelopmentEmailProvider],
})
export class EmailModule {}
