import { Module } from '@nestjs/common';
import { ConfigModule } from '@core/config/config.module';
import { ConfigService } from '@core/config/config.service';
import { EMAIL_PROVIDER } from './email.constants';
import { DevelopmentEmailProvider } from './providers/development-email.provider';
import { SmtpEmailProvider } from './providers/smtp-email.provider';
import type { IEmailProvider } from './interfaces/email-provider.interface';

/**
 * Selects the `IEmailProvider` implementation purely from `EMAIL_PROVIDER`
 * (validated in `env.validation.ts`), mirroring the same
 * env-var-driven-factory pattern `MarketDataModule` already uses for
 * MOCK vs ANGEL_ONE. DEVELOPMENT is the safe default — it never makes a
 * network call and requires no credentials.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    DevelopmentEmailProvider,
    SmtpEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      useFactory: (
        configService: ConfigService,
        development: DevelopmentEmailProvider,
        smtp: SmtpEmailProvider,
      ): IEmailProvider =>
        configService.emailProvider === 'SMTP' ? smtp : development,
      inject: [ConfigService, DevelopmentEmailProvider, SmtpEmailProvider],
    },
  ],
  exports: [EMAIL_PROVIDER, DevelopmentEmailProvider],
})
export class EmailModule {}
