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
  stack?: string;
}

/**
 * Narrow view of nodemailer's `SentMessageInfo` — cast to explicitly here
 * rather than typing the transporter field generically, since `Transporter`
 * with `pool: true` and without `pool: true` resolve to two structurally
 * incompatible `SentMessageInfo` shapes upstream; only these three fields are
 * actually used, and both real shapes carry them.
 */
interface SentMessageInfoLike {
  messageId?: string;
  accepted?: unknown[];
  rejected?: unknown[];
}

// Socket-level caps passed straight to nodemailer — these bound how long a
// *single* TCP/SMTP operation (connect, TLS handshake + greeting, or a body
// write) can hang before nodemailer itself gives up and rejects. Raised from
// 5s to 30s: Render production logs showed `smtp_connection_verify_failed`
// with `errorCode: ETIMEDOUT` firing on the *separate* verify() connection —
// see the removal note on `send()` below — and 5s was tight enough to be
// indistinguishable from a genuinely slow-but-working handshake on some
// networks. 30s gives a real connection room to complete while still failing
// well before Render's own reverse-proxy timeout.
const SMTP_CONNECTION_TIMEOUT_MS = 30_000;
const SMTP_GREETING_TIMEOUT_MS = 30_000;
const SMTP_SOCKET_TIMEOUT_MS = 30_000;

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
      // See the constants' own docstring above.
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
      // Reuses a warm connection across requests instead of opening a fresh
      // TCP/TLS handshake for every password-reset email — fewer handshakes
      // means fewer chances to hit the same connection-level flakiness that
      // was timing out verify().
      pool: true,
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
        connectionTimeoutMs: SMTP_CONNECTION_TIMEOUT_MS,
        greetingTimeoutMs: SMTP_GREETING_TIMEOUT_MS,
        socketTimeoutMs: SMTP_SOCKET_TIMEOUT_MS,
        pool: true,
      }),
      'SmtpEmailProvider',
    );
  }

  /**
   * `transporter.verify()` is deliberately never called here. It opens its
   * own separate connection purely to probe the server before the real one
   * — on Render this second connection was the one timing out
   * (`smtp_connection_verify_failed` / `ETIMEDOUT`), blocking every request
   * before `sendMail()` (which opens and uses its own connection regardless
   * of what verify() does) ever got a chance to run. `sendMail()` already
   * fails on its own if the connection is genuinely bad — verify() added a
   * redundant, strictly worse-latency failure mode on top of that, not a
   * safety net.
   */
  async send(message: EmailMessage): Promise<void> {
    const correlationId = CorrelationIdStore.getId();
    const startedAt = Date.now();

    this.logger.log(
      JSON.stringify({
        event: 'smtp_send_mail_started',
        maskedRecipient: maskEmail(message.to),
        subject: message.subject,
        correlationId,
      }),
      'SmtpEmailProvider',
    );

    try {
      const info = (await this.transporter.sendMail({
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
      })) as SentMessageInfoLike;

      this.logger.log(
        JSON.stringify({
          event: 'smtp_send_mail_succeeded',
          maskedRecipient: maskEmail(message.to),
          messageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
          durationMs: Date.now() - startedAt,
          correlationId,
        }),
        'SmtpEmailProvider',
      );
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
          errorStack: smtpError?.stack ?? null,
          durationMs: Date.now() - startedAt,
          correlationId,
        }),
        smtpError?.stack,
        'SmtpEmailProvider',
      );
      throw new Error(`Failed to send email: ${reason}`, { cause: error });
    }
  }
}
