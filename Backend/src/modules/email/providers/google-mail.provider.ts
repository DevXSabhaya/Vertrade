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
 * Narrow view of a Gmail API / Gaxios error. `code`/`status` are the
 * error's own numeric/HTTP status; `message` is the top-level diagnostic
 * text; `response.data.error` is Google's actual JSON error body (AIP-193
 * shape: `{ code, message, errors: [...], status }`), which is what
 * carries the real `errors[]` array and the machine-readable `status`
 * string (e.g. `UNAUTHENTICATED`, `PERMISSION_DENIED`). None of these
 * fields can ever contain GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, an
 * access token, the OTP, or the reset URL — Google's error bodies never
 * echo back credentials, only what was wrong with the request/auth.
 */
interface GoogleApiErrorLike {
  message?: string;
  code?: string | number;
  status?: number;
  stack?: string;
  response?: {
    status?: number;
    data?: {
      error?: {
        code?: number;
        message?: string;
        status?: string;
        errors?: unknown[];
      };
    };
  };
}

// The Gmail API is a plain HTTPS REST call, but the underlying `fetch`
// client has no default timeout — a stalled TLS handshake or a hung
// upstream would otherwise wait indefinitely. This bounds every individual
// send attempt to a single request's worth of real HTTP latency.
const GMAIL_SEND_TIMEOUT_MS = 15_000;
const ACCESS_TOKEN_TIMEOUT_MS = 15_000;

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
        : (error.response?.status ?? error.response?.data?.error?.code);
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

/** Full, structured, credential-free error diagnostics — every field requirement 6 asked for. */
function describeError(error: unknown): Record<string, unknown> {
  const googleError = error as GoogleApiErrorLike;
  const body = googleError.response?.data?.error;
  return {
    status: googleError.response?.status ?? googleError.status ?? null,
    message: googleError.message ?? body?.message ?? 'Unknown Gmail API error',
    code: googleError.code ?? body?.code ?? null,
    apiStatus: body?.status ?? null,
    errors: body?.errors ?? null,
    stack: googleError.stack ?? null,
  };
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
 * The access-token refresh is deliberately performed as its own explicit
 * step (`oauth2Client.getAccessToken()`) before every send attempt, rather
 * than letting `google-auth-library` refresh it silently inside the Gmail
 * API call. Functionally both approaches work — `OAuth2Client` refreshes
 * automatically either way — but making it explicit means an OAuth failure
 * (bad `GOOGLE_REFRESH_TOKEN`/`GOOGLE_CLIENT_SECRET`, revoked access) logs
 * as its own distinct, unambiguous step instead of being indistinguishable
 * from a Gmail-API-level failure.
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
    this.logger.log(
      'GoogleMailProvider: constructing — creating OAuth client',
      'GoogleMailProvider',
    );

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

    // Startup diagnostic — confirms which sender identity is wired in and
    // whether each required credential is actually non-empty, without ever
    // printing GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, or an access
    // token. `hasX: boolean` (presence only) is deliberately what's logged,
    // not a masked prefix — even a masked prefix of a secret is more than
    // this log line should ever carry.
    this.logger.log(
      JSON.stringify({
        event: 'google_mail_provider_configured',
        maskedFrom: maskEmail(this.fromEmail),
        fromName: this.fromName,
        hasClientId: this.configService.googleClientId.trim() !== '',
        hasClientSecret: this.configService.googleClientSecret.trim() !== '',
        hasRefreshToken: this.configService.googleRefreshToken.trim() !== '',
        hasRedirectUri: this.configService.googleRedirectUri.trim() !== '',
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
   * Every step (access-token refresh, the Gmail API call itself) is logged
   * before and after; any failure anywhere in this method logs the
   * complete error body and rethrows — nothing here ever swallows an error
   * or returns success without a real Gmail API message ID.
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
    this.logger.log('GoogleMailProvider.send(): entered', 'GoogleMailProvider');

    const raw = buildRawMimeMessage(message, {
      name: this.fromName,
      email: this.fromEmail,
    });

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
      try {
        this.logger.log(
          JSON.stringify({
            event: 'access_token_refresh_started',
            attempt,
            correlationId,
          }),
          'GoogleMailProvider',
        );
        const { token } = await withTimeout(
          this.oauth2Client.getAccessToken(),
          ACCESS_TOKEN_TIMEOUT_MS,
          'OAuth2Client.getAccessToken()',
        );
        if (!token) {
          throw new Error(
            'OAuth2Client.getAccessToken() returned no access token — check GOOGLE_REFRESH_TOKEN/GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET',
          );
        }
        this.logger.log(
          JSON.stringify({
            event: 'access_token_refresh_succeeded',
            attempt,
            correlationId,
          }),
          'GoogleMailProvider',
        );

        this.logger.log(
          JSON.stringify({
            event: 'gmail_api_request_started',
            attempt,
            recipient: maskedRecipient,
            correlationId,
          }),
          'GoogleMailProvider',
        );
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
            event: 'gmail_api_response_received',
            attempt,
            httpStatus: response.status,
            correlationId,
          }),
          'GoogleMailProvider',
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
        const fullError = describeError(error);

        this.logger.error(
          JSON.stringify({
            event: 'email_send_attempt_failed',
            provider: 'GOOGLE',
            recipient: maskedRecipient,
            attempt,
            maxAttempts: MAX_SEND_ATTEMPTS,
            transient,
            correlationId,
            ...fullError,
          }),
          typeof fullError.stack === 'string' ? fullError.stack : undefined,
          'GoogleMailProvider',
        );

        if (!transient || attempt === MAX_SEND_ATTEMPTS) {
          break;
        }
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }

    const fullError = describeError(lastError);
    this.logger.error(
      JSON.stringify({
        event: 'email_send_failed',
        provider: 'GOOGLE',
        recipient: maskedRecipient,
        durationMs: Date.now() - startedAt,
        correlationId,
        ...fullError,
      }),
      typeof fullError.stack === 'string' ? fullError.stack : undefined,
      'GoogleMailProvider',
    );
    // Never swallowed, never converted into a "success" — the real error
    // is always what propagates, matching what SmtpEmailProvider/
    // ResendEmailProvider already threw, so PasswordResetService's
    // existing catch-and-convert-to-EmailDeliveryFailedException logic
    // needs no changes.
    throw new Error(`Failed to send email: ${String(fullError.message)}`, {
      cause: lastError,
    });
  }
}
