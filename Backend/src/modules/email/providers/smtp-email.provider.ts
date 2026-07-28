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

// Socket-level caps passed straight to nodemailer — these bound how long a
// *single* TCP/SMTP operation (connect, TLS handshake + greeting, or a body
// write) can hang before nodemailer itself gives up and rejects. Without
// these, nodemailer falls back to Node's default socket behavior, which on a
// host where the outbound SMTP port is silently dropped (firewalled, not
// actively refused) never times out on its own — the socket just sits open
// until the OS's own multi-minute TCP retransmission limit gives up. That is
// exactly what produced the Render 502: the platform's own reverse-proxy
// timeout fired first, with our request still stuck mid-`connect()` and
// nothing ever logged, because the request handler had not returned yet.
const SMTP_CONNECTION_TIMEOUT_MS = 5_000;
const SMTP_GREETING_TIMEOUT_MS = 5_000;
const SMTP_SOCKET_TIMEOUT_MS = 5_000;

// Hard backstop covering the whole `verify()` + `sendMail()` sequence
// together — this is the actual enforcement of "this endpoint must never
// wait more than 10 seconds", independent of whether nodemailer's own
// per-socket timeouts fire as expected for a given failure mode.
const SMTP_OVERALL_TIMEOUT_MS = 10_000;

/**
 * Races `operation` against a timer that rejects after `timeoutMs`. This
 * bounds how long the *caller* waits — it does not cancel the underlying
 * socket/operation (nodemailer has no cancellation API), but the caller is
 * guaranteed to get control back by the deadline regardless of what the
 * stuck operation is doing.
 */
function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
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
      // See the constants' own docstring above: without these, a firewalled
      // (not actively refused) outbound SMTP port hangs indefinitely instead
      // of failing fast.
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
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
        overallTimeoutMs: SMTP_OVERALL_TIMEOUT_MS,
      }),
      'SmtpEmailProvider',
    );
  }

  /**
   * The entire verify+send sequence is wrapped in one `withTimeout` so this
   * method's caller (`PasswordResetService.requestReset` → the
   * `POST /auth/forgot-password` controller) is guaranteed to get control
   * back within `SMTP_OVERALL_TIMEOUT_MS`, and can therefore always return a
   * real HTTP response (`502 EMAIL_DELIVERY_FAILED`) instead of the request
   * hanging until the platform's own reverse-proxy gives up. If the deadline
   * itself fires (rather than a real SMTP rejection), the error surfaces
   * through the same `smtp_email_send_failed` log/throw path as any other
   * `sendMail()` failure — see `withTimeoutFailure`.
   */
  async send(message: EmailMessage): Promise<void> {
    const correlationId = CorrelationIdStore.getId();
    const overallStartedAt = Date.now();

    try {
      await withTimeout(
        this.verifyConnection(correlationId),
        SMTP_OVERALL_TIMEOUT_MS,
        'SMTP verify()',
      );
    } catch (error) {
      this.throwVerifyFailure(error, correlationId);
    }

    const remainingMs = Math.max(
      SMTP_OVERALL_TIMEOUT_MS - (Date.now() - overallStartedAt),
      1,
    );
    try {
      await withTimeout(
        this.sendMail(message, correlationId),
        remainingMs,
        'SMTP sendMail()',
      );
    } catch (error) {
      this.throwSendFailure(error, message, correlationId);
    }

    this.logger.log(
      JSON.stringify({
        event: 'smtp_email_send_succeeded',
        maskedRecipient: maskEmail(message.to),
        subject: message.subject,
        totalDurationMs: Date.now() - overallStartedAt,
        correlationId,
      }),
      'SmtpEmailProvider',
    );
  }

  private async verifyConnection(
    correlationId: string | undefined,
  ): Promise<void> {
    const startedAt = Date.now();
    this.logger.log(
      JSON.stringify({
        event: 'smtp_connection_verify_started',
        smtpHost: this.configService.smtpHost,
        smtpPort: this.configService.smtpPort,
        correlationId,
      }),
      'SmtpEmailProvider',
    );
    await this.transporter.verify();
    this.logger.log(
      JSON.stringify({
        event: 'smtp_connection_verify_succeeded',
        durationMs: Date.now() - startedAt,
        correlationId,
      }),
      'SmtpEmailProvider',
    );
  }

  private async sendMail(
    message: EmailMessage,
    correlationId: string | undefined,
  ): Promise<void> {
    const startedAt = Date.now();
    this.logger.log(
      JSON.stringify({
        event: 'smtp_send_mail_started',
        maskedRecipient: maskEmail(message.to),
        correlationId,
      }),
      'SmtpEmailProvider',
    );
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
    this.logger.log(
      JSON.stringify({
        event: 'smtp_send_mail_succeeded',
        maskedRecipient: maskEmail(message.to),
        durationMs: Date.now() - startedAt,
        correlationId,
      }),
      'SmtpEmailProvider',
    );
  }

  private throwVerifyFailure(
    error: unknown,
    correlationId: string | undefined,
  ): never {
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
        correlationId,
      }),
      undefined,
      'SmtpEmailProvider',
    );
    throw new Error(
      `SMTP connection/authentication failed: ${smtpError?.message ?? 'Unknown error'}`,
      { cause: error },
    );
  }

  private throwSendFailure(
    error: unknown,
    message: EmailMessage,
    correlationId: string | undefined,
  ): never {
    const smtpError = error as SmtpErrorLike;
    const reason =
      typeof smtpError?.message === 'string'
        ? smtpError.message
        : 'Unknown SMTP error';
    // Structured, credential-free diagnostics: enough to root-cause a
    // delivery failure (wrong host/port/secure pairing, bad auth, network
    // refusal, the destination server's own rejection reason, or this
    // provider's own timeout firing) without ever logging SMTP_PASS, the
    // reset code, the reset URL, or the full recipient address.
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
        correlationId,
      }),
      undefined,
      'SmtpEmailProvider',
    );
    throw new Error(`Failed to send email: ${reason}`, { cause: error });
  }
}
