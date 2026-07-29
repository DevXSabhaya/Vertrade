import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import { ConfigService } from '@core/config/config.service';
import { LoggerService } from '@core/logger/logger.service';
import { CorrelationIdStore } from '@core/correlation/correlation-id.store';
import { maskEmail } from '@shared/email/mask-email.util';
import { withTimeout } from '@shared/http/with-timeout.util';
import type {
  EmailMessage,
  IEmailProvider,
} from '../interfaces/email-provider.interface';

/**
 * Narrow view of a Resend API error — never the full SDK error object.
 * `name` is one of Resend's documented error codes (e.g.
 * `validation_error`, `invalid_from_address`, `rate_limit_exceeded`);
 * `message`/`statusCode` are the server's own diagnostic text/HTTP status.
 * None of these fields can ever contain RESEND_API_KEY, the OTP, or the
 * reset URL.
 */
interface ResendErrorLike {
  message?: string;
  name?: string;
  statusCode?: number | null;
  stack?: string;
}

// Resend is a plain HTTPS REST call (unlike SMTP, it cannot be blocked by an
// outbound-port firewall the way Gmail SMTP was on Render), but `fetch` still
// has no default timeout — a stalled TLS handshake or a hung upstream would
// otherwise wait indefinitely. This bounds every send to a single request's
// worth of real HTTP latency.
const RESEND_SEND_TIMEOUT_MS = 15_000;

/**
 * Real email delivery via the Resend HTTPS API. Only constructed/used when
 * EMAIL_PROVIDER=RESEND — `env.validation.ts` guarantees RESEND_API_KEY/
 * EMAIL_FROM/EMAIL_FROM_NAME are non-empty in that case. Introduced to
 * replace Gmail SMTP after Render logs showed every outbound SMTP
 * connection failing with `ETIMEDOUT` (see `SmtpEmailProvider`, kept intact
 * and selectable via `EMAIL_PROVIDER=SMTP` for rollback) — Resend's plain
 * HTTPS transport isn't subject to the same outbound-SMTP-port blocking.
 *
 * Uses `resend.emails.send()` — the current, documented send method.
 * `Resend#audiences` (deprecated in favor of `segments`) and no other
 * legacy method are ever referenced here.
 *
 * Never logs the message body, recipient's OTP/reset link, or
 * RESEND_API_KEY — only a masked recipient + subject.
 */
@Injectable()
export class ResendEmailProvider implements IEmailProvider {
  private readonly client: Resend;
  private readonly fromName: string;
  private readonly fromEmail: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.fromName = this.configService.emailFromName;
    this.fromEmail = this.configService.emailFrom;
    this.client = new Resend(this.configService.resendApiKey);

    // Startup diagnostic — confirms which sender identity is wired in
    // without ever printing RESEND_API_KEY.
    this.logger.log(
      JSON.stringify({
        event: 'resend_email_provider_configured',
        maskedFrom: maskEmail(this.fromEmail),
        fromName: this.fromName,
        sendTimeoutMs: RESEND_SEND_TIMEOUT_MS,
      }),
      'ResendEmailProvider',
    );
  }

  /**
   * The Resend SDK does not throw on an API-level rejection (invalid
   * recipient, unverified sending domain, bad API key, rate limit, ...) —
   * it resolves with `{ data: null, error: {...} }` instead. That case and a
   * genuine network-level throw (timeout, DNS failure, TLS error) are both
   * normalized into the same thrown `Error` here, so `PasswordResetService`
   * (and any future caller) only ever has to handle one failure shape,
   * identical to what `SmtpEmailProvider` already throws — switching
   * `EMAIL_PROVIDER` never changes the caller-visible contract.
   */
  async send(message: EmailMessage): Promise<void> {
    const correlationId = CorrelationIdStore.getId();
    const startedAt = Date.now();
    const maskedRecipient = maskEmail(message.to);

    this.logger.log(
      JSON.stringify({
        event: 'email_send_started',
        provider: 'RESEND',
        recipient: maskedRecipient,
        subject: message.subject,
        correlationId,
      }),
      'ResendEmailProvider',
    );

    try {
      const { data, error } = await withTimeout(
        this.client.emails.send({
          from: `${this.fromName} <${this.fromEmail}>`,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        RESEND_SEND_TIMEOUT_MS,
        'Resend emails.send()',
      );

      if (error) {
        // Resend's own graceful rejection — routed through the same
        // logging/throw path as a genuine network-level failure (see the
        // `catch` below) via `failAndThrow`, so this method has exactly one
        // failure path to reason about instead of two.
        this.failAndThrow(error, maskedRecipient, startedAt, correlationId);
      }

      this.logger.log(
        JSON.stringify({
          event: 'email_send_success',
          provider: 'RESEND',
          recipient: maskedRecipient,
          messageId: data?.id ?? null,
          durationMs: Date.now() - startedAt,
          correlationId,
        }),
        'ResendEmailProvider',
      );
    } catch (error) {
      this.failAndThrow(error, maskedRecipient, startedAt, correlationId);
    }
  }

  /**
   * Shared by both failure sources: Resend's graceful `{ error }` response
   * field and a genuine thrown exception (network failure, or this
   * provider's own `withTimeout` deadline firing). Both shapes carry a
   * `message`, so both normalize into the same structured log line and the
   * same thrown `Error` — callers never need to know which one occurred.
   */
  private failAndThrow(
    error: unknown,
    maskedRecipient: string,
    startedAt: number,
    correlationId: string | undefined,
  ): never {
    const resendError = error as ResendErrorLike;
    const reason =
      typeof resendError?.message === 'string'
        ? resendError.message
        : 'Unknown Resend error';
    // Structured, credential-free diagnostics: enough to root-cause a
    // delivery failure (bad API key, unverified domain, invalid recipient,
    // rate limiting, or this provider's own timeout firing) without ever
    // logging RESEND_API_KEY, the reset code, the reset URL, or the full
    // recipient address.
    this.logger.error(
      JSON.stringify({
        event: 'email_send_failed',
        provider: 'RESEND',
        recipient: maskedRecipient,
        errorName: resendError?.name ?? 'UNKNOWN',
        statusCode: resendError?.statusCode ?? null,
        errorMessage: reason,
        durationMs: Date.now() - startedAt,
        correlationId,
      }),
      resendError?.stack,
      'ResendEmailProvider',
    );
    throw new Error(`Failed to send email: ${reason}`, { cause: error });
  }
}
