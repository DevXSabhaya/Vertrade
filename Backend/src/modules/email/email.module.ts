import { Module } from '@nestjs/common';
import { ConfigModule } from '@core/config/config.module';
import { ConfigService } from '@core/config/config.service';
import { LoggerService } from '@core/logger/logger.service';
import { EMAIL_PROVIDER } from './email.constants';
import { DevelopmentEmailProvider } from './providers/development-email.provider';
import { GoogleMailProvider } from './providers/google-mail.provider';
import { selectEmailProvider } from './select-email-provider.util';
import type { IEmailProvider } from './interfaces/email-provider.interface';

/**
 * Selects the `IEmailProvider` implementation via `selectEmailProvider`
 * (see that function's own docstring for the full selection rules).
 * `DevelopmentEmailProvider` is the safe non-production default — it never
 * makes a network call and requires no credentials. `GoogleMailProvider`
 * (Gmail API via OAuth2) is the only real, network-sending provider in this
 * codebase — SMTP (nodemailer) and Resend have both been fully removed.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    DevelopmentEmailProvider,
    GoogleMailProvider,
    {
      provide: EMAIL_PROVIDER,
      useFactory: (
        configService: ConfigService,
        logger: LoggerService,
        development: DevelopmentEmailProvider,
        google: GoogleMailProvider,
      ): IEmailProvider =>
        selectEmailProvider(configService, logger, development, google),
      inject: [
        ConfigService,
        LoggerService,
        DevelopmentEmailProvider,
        GoogleMailProvider,
      ],
    },
  ],
  exports: [EMAIL_PROVIDER, DevelopmentEmailProvider],
})
export class EmailModule {}
