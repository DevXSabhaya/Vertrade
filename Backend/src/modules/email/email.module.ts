import { Module } from '@nestjs/common';
import { ConfigModule } from '@core/config/config.module';
import { ConfigService } from '@core/config/config.service';
import { EMAIL_PROVIDER } from './email.constants';
import { DevelopmentEmailProvider } from './providers/development-email.provider';
import { SmtpEmailProvider } from './providers/smtp-email.provider';
import { ResendEmailProvider } from './providers/resend-email.provider';
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
        development: DevelopmentEmailProvider,
        smtp: SmtpEmailProvider,
        resend: ResendEmailProvider,
      ): IEmailProvider => {
        switch (configService.emailProvider) {
          case 'SMTP':
            return smtp;
          case 'RESEND':
            return resend;
          default:
            return development;
        }
      },
      inject: [
        ConfigService,
        DevelopmentEmailProvider,
        SmtpEmailProvider,
        ResendEmailProvider,
      ],
    },
  ],
  exports: [EMAIL_PROVIDER, DevelopmentEmailProvider],
})
export class EmailModule {}
