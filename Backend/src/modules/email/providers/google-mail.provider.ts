import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { gmail, type gmail_v1 } from '@googleapis/gmail';
import { ConfigService } from '@core/config/config.service';
import { LoggerService } from '@core/logger/logger.service';
import { CorrelationIdStore } from '@core/correlation/correlation-id.store';
import { maskEmail } from '@shared/email/mask-email.util';
import { withTimeout } from '@shared/http/with-timeout.util';
import { buildRawMimeMessage } from '../mime/build-mime-message.util';
import type {
  EmailMessage,
  IEmailProvider,
} from '../interfaces/email-provider.interface';

/**
 * Narrow view of a Gmail API / Gaxios error — never the full SDK error
 * object (which can embed request/response internals, including headers
 * that could carry the access token). `code`/`status` are the error's own
 * numeric/HTTP status; `message` is the server's own diagnostic text. None
 * of these fields can ever contain GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
 * the OTP, or the reset URL.
 */
interface GoogleApiErrorLike {
  message?: string;
  code?: string | number;
  status?: number;
  stack?: string;
}

// The Gmail API is a plain HTTPS REST call, but the underlying `fetch`
// client has no default timeout — a stalled TLS handshake or a hung
// upstream would otherwise wait indefinitely. This bounds every individual
// send attempt to a single request's worth of real HTTP latency.
const GMAIL_SEND_TIMEOUT_MS = 15_000;

// Retry policy: up to 3 attempts total, exponential backoff starting at
// 500ms (500ms, 1000ms, 2000ms between attempts). Only retried for
// *transient* failures (rate limiting, 5xx, network-level errors) — an
// auth failure or a malformed recipient will never succeed on retry, so
// retrying those would only triple the latency of an already-final failure.
const MAX_SEND_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

function isTransientError(error: GoogleApiErrorLike): boolean {
  const status =
    typeof error.status === 'number'
      ? error.status
      : typeof error.code === 'number'
        ? error.code
        : undefined;
  if (status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }
  const codeString = typeof error.code === 'string' ? error.code : '';
  if (
    [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'EAI_AGAIN',
    ].includes(codeString)
  ) {
    return true;
  }
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('econnreset')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Real email delivery via the Gmail API (OAuth2), sending as the mailbox
 * that granted `GOOGLE_REFRESH_TOKEN` — always `vertrade19@gmail.com` for
 * this deployment, configured via `EMAIL_FROM`/`EMAIL_FROM_NAME`. Replaces
 * SMTP (nodemailer) and Resend entirely; both have been removed from this
 * codebase.
 *
 * Access token refresh is handled entirely by `google-auth-library`'s
 * `OAuth2Client` — `setCredentials({ refresh_token })` is enough; the
 * client automatically exchanges the refresh token for a fresh access
 * token before each request whenever the current one is missing/expired.
 * No manual token-expiry tracking exists or is needed here.
 *
 * Only official Google packages are used: `@googleapis/gmail` (Google's own
 * per-API package — the same maintainers/generator as the full `googleapis`
 * meta-package, just scoped to Gmail so its type surface doesn't drag in
 * every other Google API) and `google-auth-library` (OAuth2Client) — no
 * third-party Gmail wrapper.
 */
@Injectable()
export class GoogleMailProvider implements IEmailProvider {
  private readonly oauth2Client: OAuth2Client;
  private readonly gmail: gmail_v1.Gmail;
  private readonly fromName: string;
  private readonly fromEmail: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.fromName = this.configService.emailFromName;
    this.fromEmail = this.configService.emailFrom;

    this.oauth2Client = new OAuth2Client({
      clientId: this.configService.googleClientId,
      clientSecret: this.configService.googleClientSecret,
      redirectUri: this.configService.googleRedirectUri,
    });
    this.oauth2Client.setCredentials({
      refresh_token: this.configService.googleRefreshToken,
    });

    this.gmail = gmail({ version: 'v1', auth: this.oauth2Client });

    // Startup diagnostic — confirms which sender identity is wired in
    // without ever printing GOOGLE_CLIENT_SECRET or GOOGLE_REFRESH_TOKEN.
    this.logger.log(
      JSON.stringify({
        event: 'google_mail_provider_configured',
        maskedFrom: maskEmail(this.fromEmail),
        fromName: this.fromName,
        sendTimeoutMs: GMAIL_SEND_TIMEOUT_MS,
        maxAttempts: MAX_SEND_ATTEMPTS,
      }),
      'GoogleMailProvider',
    );
  }

  /**
   * Retries only transient failures (rate limit / 5xx / network-level),
   * up to `MAX_SEND_ATTEMPTS` total, with exponential backoff. A
   * non-transient failure (bad auth, invalid recipient, malformed request)
   * is thrown immediately on the first attempt — see `isTransientError`.
   */
  async send(message: EmailMessage): Promise<void> {
    const correlationId = CorrelationIdStore.getId();
    const startedAt = Date.now();
    const maskedRecipient = maskEmail(message.to);

    this.logger.log(
      JSON.stringify({
        event: 'email_send_started',
        provider: 'GOOGLE',
        recipient: maskedRecipient,
        subject: message.subject,
        correlationId,
      }),
      'GoogleMailProvider',
    );

    const raw = buildRawMimeMessage(message, {
      name: this.fromName,
      email: this.fromEmail,
    });

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
      try {
        const response = await withTimeout(
          this.gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw },
          }),
          GMAIL_SEND_TIMEOUT_MS,
          'Gmail users.messages.send()',
        );

        this.logger.log(
          JSON.stringify({
            event: 'email_send_success',
            provider: 'GOOGLE',
            recipient: maskedRecipient,
            messageId: response.data.id ?? null,
            attempt,
            durationMs: Date.now() - startedAt,
            correlationId,
          }),
          'GoogleMailProvider',
        );
        return;
      } catch (error) {
        lastError = error;
        const googleError = error as GoogleApiErrorLike;
        const transient = isTransientError(googleError);

        this.logger.error(
          JSON.stringify({
            event: 'email_send_attempt_failed',
            provider: 'GOOGLE',
            recipient: maskedRecipient,
            attempt,
            maxAttempts: MAX_SEND_ATTEMPTS,
            transient,
            errorCode: googleError.code ?? googleError.status ?? 'UNKNOWN',
            errorMessage: googleError.message ?? 'Unknown Gmail API error',
            correlationId,
          }),
          googleError.stack,
          'GoogleMailProvider',
        );

        if (!transient || attempt === MAX_SEND_ATTEMPTS) {
          break;
        }
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }

    const googleError = lastError as GoogleApiErrorLike;
    const reason =
      typeof googleError?.message === 'string'
        ? googleError.message
        : 'Unknown Gmail API error';
    this.logger.error(
      JSON.stringify({
        event: 'email_send_failed',
        provider: 'GOOGLE',
        recipient: maskedRecipient,
        errorMessage: reason,
        durationMs: Date.now() - startedAt,
        correlationId,
      }),
      googleError?.stack,
      'GoogleMailProvider',
    );
    throw new Error(`Failed to send email: ${reason}`, { cause: lastError });
  }
}
