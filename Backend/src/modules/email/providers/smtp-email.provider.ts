import { Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ConfigService } from '@core/config/config.service';
import { LoggerService } from '@core/logger/logger.service';
import { CorrelationIdStore } from '@core/correlation/correlation-id.store';
import { maskEmail } from '@shared/email/mask-email.util';
import type {
  EmailMessage,
  IEmailProvider,
} from '../interfaces/email-provider.interface';

/**
 * Narrow view of the fields a nodemailer/SMTP error actually carries — never
 * the full error object (which can embed transport/socket internals). None
 * of these fields can ever contain SMTP_PASS, the OTP, or the reset URL:
 * they're protocol-level diagnostics (auth result, connection outcome, the
 * server's own rejection reason), not application payload.
 */
interface SmtpErrorLike {
  message?: string;
  code?: string;
  responseCode?: number;
  response?: string;
  command?: string;
}

/**
 * Real SMTP delivery via nodemailer. Only constructed/used when
 * EMAIL_PROVIDER=SMTP — `env.validation.ts` guarantees SMTP_HOST/USER/PASS/
 * FROM are non-empty in that case, so no credential here is ever hardcoded
 * or defaulted. Never logs the message body, recipient's OTP/reset link, or
 * SMTP_PASS (only a masked recipient + subject), so a raw reset code never
 * reaches application logs.
 */
@Injectable()
export class SmtpEmailProvider implements IEmailProvider {
  private readonly transporter: Transporter;
  private readonly fromName: string;
  private readonly fromEmail: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    // env.validation.ts guarantees both are non-empty, valid-email SMTP_FROM
    // when EMAIL_PROVIDER=SMTP — never derived from SMTP_USER, which is only
    // the auth identity and is not guaranteed to be an address this relay
    // will accept as a sender.
    this.fromName = this.configService.smtpFromName;
    this.fromEmail = this.configService.smtpFrom;
    this.transporter = nodemailer.createTransport({
      host: this.configService.smtpHost,
      port: this.configService.smtpPort,
      secure: this.configService.smtpSecure,
      auth: {
        user: this.configService.smtpUser,
        pass: this.configService.smtpPass,
      },
    });

    // Startup diagnostic — confirms exactly which SMTP endpoint/identity is
    // wired in without ever printing SMTP_PASS or the full user/from address.
    this.logger.log(
      JSON.stringify({
        event: 'smtp_email_provider_configured',
        smtpHost: this.configService.smtpHost,
        smtpPort: this.configService.smtpPort,
        secure: this.configService.smtpSecure,
        maskedUser: maskEmail(this.configService.smtpUser),
        maskedFrom: maskEmail(this.fromEmail),
      }),
      'SmtpEmailProvider',
    );
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transporter.verify();
    } catch (error) {
      const smtpError = error as SmtpErrorLike;
      this.logger.error(
        JSON.stringify({
          event: 'smtp_connection_verify_failed',
          provider: 'SMTP',
          smtpHost: this.configService.smtpHost,
          smtpPort: this.configService.smtpPort,
          secure: this.configService.smtpSecure,
          errorCode: smtpError?.code ?? 'UNKNOWN',
          responseCode: smtpError?.responseCode ?? null,
          smtpResponse: smtpError?.response ?? null,
          errorMessage: smtpError?.message ?? 'Unknown SMTP error',
          correlationId: CorrelationIdStore.getId(),
        }),
        undefined,
        'SmtpEmailProvider',
      );
      throw new Error(
        `SMTP connection/authentication failed: ${smtpError?.message ?? 'Unknown error'}`,
        { cause: error },
      );
    }
    try {
      await this.transporter.sendMail({
        // Explicit name/address form — nodemailer renders this as a proper
        // RFC 5322 `From: "Name" <address>` header, and it is also what
        // nodemailer derives the envelope MAIL FROM from by default. We set
        // `envelope` explicitly anyway so the SMTP envelope sender can never
        // silently diverge from the header even if the message shape above
        // changes later.
        from: { name: this.fromName, address: this.fromEmail },
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        envelope: {
          from: this.fromEmail,
          to: [message.to],
        },
      });
    } catch (error) {
      const smtpError = error as SmtpErrorLike;
      const reason =
        typeof smtpError?.message === 'string'
          ? smtpError.message
          : 'Unknown SMTP error';
      // Structured, credential-free diagnostics: enough to root-cause a
      // delivery failure (wrong host/port/secure pairing, bad auth, network
      // refusal, or the destination server's own rejection reason) without
      // ever logging SMTP_PASS, the reset code, the reset URL, or the full
      // recipient address.
      this.logger.error(
        JSON.stringify({
          event: 'smtp_email_send_failed',
          provider: 'SMTP',
          smtpHost: this.configService.smtpHost,
          smtpPort: this.configService.smtpPort,
          secure: this.configService.smtpSecure,
          maskedRecipient: maskEmail(message.to),
          smtpCommand: smtpError?.command ?? null,
          errorCode: smtpError?.code ?? 'UNKNOWN',
          responseCode: smtpError?.responseCode ?? null,
          smtpResponse: smtpError?.response ?? null,
          errorMessage: reason,
          correlationId: CorrelationIdStore.getId(),
        }),
        undefined,
        'SmtpEmailProvider',
      );
      throw new Error(`Failed to send email: ${reason}`, { cause: error });
    }
    this.logger.log(
      `[SmtpEmailProvider] email sent to ${maskEmail(message.to)} (subject: "${message.subject}")`,
      'SmtpEmailProvider',
    );
  }
}
