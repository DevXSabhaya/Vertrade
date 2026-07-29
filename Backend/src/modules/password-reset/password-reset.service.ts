import { randomInt, randomBytes, createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { LoggerService } from '@core/logger/logger.service';
import { CorrelationIdStore } from '@core/correlation/correlation-id.store';
import { maskEmail } from '@shared/email/mask-email.util';
import { EMAIL_PROVIDER } from '@modules/email/email.constants';
import type { IEmailProvider } from '@modules/email/interfaces/email-provider.interface';
import { UsersService } from '@modules/users/users.service';
import { PASSWORD_RESET_REPOSITORY } from './password-reset.constants';
import type { IPasswordResetRepository } from './interfaces/password-reset-repository.interface';
import { InvalidResetCodeException } from './exceptions/invalid-reset-code.exception';
import { InvalidResetSessionException } from './exceptions/invalid-reset-session.exception';
import { TooManyResetRequestsException } from './exceptions/too-many-reset-requests.exception';
import { EmailDeliveryFailedException } from './exceptions/email-delivery-failed.exception';
import { buildPasswordResetEmail } from './templates/password-reset-email.template';
import {
  RESET_TOKEN_TTL_MINUTES,
  RESET_TOKEN_MAX_ATTEMPTS,
  RESET_REQUEST_RATE_LIMIT,
  RESET_REQUEST_RATE_LIMIT_WINDOW_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  RESET_SESSION_TTL_MINUTES,
} from './password-reset.constants';

const BCRYPT_SALT_ROUNDS = 12;
const SECOND_MS = 1_000;
const MINUTE_MS = 60_000;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface RequestResetResult {
  readonly cooldownSeconds: number;
  /**
   * UTC ISO timestamp of when the just-sent (or, for a non-existent
   * account, hypothetical) code would expire — always `now + 15 minutes`
   * regardless of account existence, so this field's presence/value can
   * never be used to infer whether the email has an account. The frontend
   * must treat this as the single source of truth for the OTP countdown
   * instead of deriving its own expiry from `cooldownSeconds` (the resend
   * cooldown is a *different*, much shorter window and was never meant to
   * represent code validity).
   */
  readonly codeExpiresAt: string;
}

export interface VerifyCodeResult {
  readonly resetToken: string;
  readonly expiresInSeconds: number;
}

/**
 * Real password-reset use case, in four steps matching the frontend wizard:
 *  1. `requestReset` (also used verbatim for "resend") — generate + email a
 *     6-digit OTP, storing only its SHA-256 hash.
 *  2. `verifyCode` — check the OTP and, on success, issue a short-lived
 *     reset-session token (also stored only as a hash) that step 4 requires.
 *  3. resend is literally `requestReset` again — same email, no new lookup
 *     needed since the frontend already has it from step 1.
 *  4. `resetPassword` — requires a valid, unexpired, unused session token
 *     from step 2; hashes the new password with the same bcrypt mechanism
 *     `AuthService` uses.
 * Deliberately never reveals whether a given email has an account: every
 * public method here returns/throws identically regardless of account
 * existence, except `EmailDeliveryFailedException`, which is only ever
 * thrown for an account that *does* exist and *only* when the configured
 * email provider genuinely failed — an infrastructure signal, not an
 * account-existence signal.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    @Inject(PASSWORD_RESET_REPOSITORY)
    private readonly repository: IPasswordResetRepository,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: IEmailProvider,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly usersService: UsersService,
    private readonly logger: LoggerService,
  ) {}

  async requestReset(email: string): Promise<RequestResetResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const now = this.clock.now();

    // Cooldown first — cheaper and faster-triggering than the abuse-rate
    // window below, and checked/recorded unconditionally (before any email
    // lookup) so neither throttle can ever be used to infer account
    // existence.
    const lastRequestAt =
      await this.repository.findLastRequestAt(normalizedEmail);
    if (lastRequestAt) {
      const elapsedSeconds =
        (now.getTime() - new Date(lastRequestAt).getTime()) / SECOND_MS;
      if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
        const retryAfterSeconds = Math.ceil(
          RESEND_COOLDOWN_SECONDS - elapsedSeconds,
        );
        throw new TooManyResetRequestsException(
          `Please wait ${retryAfterSeconds}s before requesting another code.`,
        );
      }
    }

    const windowStart = new Date(
      now.getTime() - RESET_REQUEST_RATE_LIMIT_WINDOW_MINUTES * MINUTE_MS,
    ).toISOString();
    const recentRequests = await this.repository.countRequestAttemptsSince(
      normalizedEmail,
      windowStart,
    );
    if (recentRequests >= RESET_REQUEST_RATE_LIMIT) {
      throw new TooManyResetRequestsException(
        'Too many password reset requests. Please try again later.',
      );
    }
    await this.repository.recordRequestAttempt(
      normalizedEmail,
      now.toISOString(),
    );

    // Computed unconditionally — before the account-existence check — so a
    // non-existent account gets an identical `codeExpiresAt` shape/value to
    // a real one instead of an omitted/different field that would leak
    // account existence.
    const expiresAt = new Date(
      now.getTime() + RESET_TOKEN_TTL_MINUTES * MINUTE_MS,
    ).toISOString();

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      // Deliberately silent — the caller sees the same outcome either way.
      return {
        cooldownSeconds: RESEND_COOLDOWN_SECONDS,
        codeExpiresAt: expiresAt,
      };
    }

    // A new request supersedes any still-pending code for this user.
    await this.repository.invalidateAllForUser(user.id);

    const code = randomInt(100_000, 1_000_000).toString().padStart(6, '0');
    await this.repository.create({
      userId: user.id,
      email: normalizedEmail,
      codeHash: sha256Hex(code),
      expiresAt,
      createdAt: now.toISOString(),
    });

    const maskedEmail = maskEmail(normalizedEmail);
    const emailSendStartedAt = Date.now();
    this.logger.log(
      `password_reset_email_send_started email=${maskedEmail}`,
      'PasswordResetService',
    );
    try {
      const { subject, text, html } = buildPasswordResetEmail(
        code,
        RESET_TOKEN_TTL_MINUTES,
      );
      await this.emailProvider.send({
        to: normalizedEmail,
        subject,
        text,
        html,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      // `IEmailProvider.send()` is required to reject within its own bounded
      // deadline (see `GoogleMailProvider`'s `GMAIL_SEND_TIMEOUT_MS`), so
      // this catch is always reached quickly — `durationMs` here is what
      // confirms that in production logs rather than just in tests.
      this.logger.error(
        JSON.stringify({
          event: 'password_reset_email_send_failed',
          email: maskedEmail,
          reason,
          durationMs: Date.now() - emailSendStartedAt,
          correlationId: CorrelationIdStore.getId(),
        }),
        undefined,
        'PasswordResetService',
      );
      throw new EmailDeliveryFailedException(
        "We couldn't send the reset email right now. Please try again shortly.",
      );
    }
    this.logger.log(
      JSON.stringify({
        event: 'password_reset_email_send_succeeded',
        email: maskedEmail,
        durationMs: Date.now() - emailSendStartedAt,
        correlationId: CorrelationIdStore.getId(),
      }),
      'PasswordResetService',
    );

    return {
      cooldownSeconds: RESEND_COOLDOWN_SECONDS,
      codeExpiresAt: expiresAt,
    };
  }

  async verifyCode(email: string, code: string): Promise<VerifyCodeResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const genericFailure = (): InvalidResetCodeException =>
      new InvalidResetCodeException(
        'Invalid or expired code. Please try again.',
      );

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      throw genericFailure();
    }

    const token = await this.repository.findLatestUnusedByUserId(user.id);
    if (!token) {
      throw genericFailure();
    }

    const now = this.clock.now();
    if (new Date(token.expiresAt).getTime() < now.getTime()) {
      throw genericFailure();
    }
    if (token.attempts >= RESET_TOKEN_MAX_ATTEMPTS) {
      throw genericFailure();
    }
    if (token.verifiedAt) {
      // Already verified once — a verified code must be spent via
      // resetPassword, not re-verified (its session token is single-use).
      throw genericFailure();
    }

    if (sha256Hex(code) !== token.codeHash) {
      await this.repository.incrementAttempts(token.id);
      throw genericFailure();
    }

    const resetToken = randomBytes(32).toString('hex');
    const sessionExpiresAt = new Date(
      now.getTime() + RESET_SESSION_TTL_MINUTES * MINUTE_MS,
    ).toISOString();
    await this.repository.markVerified(
      token.id,
      sha256Hex(resetToken),
      sessionExpiresAt,
    );

    return {
      resetToken,
      expiresInSeconds: RESET_SESSION_TTL_MINUTES * 60,
    };
  }

  async resetPassword(
    email: string,
    resetToken: string,
    newPassword: string,
  ): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const genericFailure = (): InvalidResetSessionException =>
      new InvalidResetSessionException(
        'Your session has expired. Please request a new code.',
      );

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      throw genericFailure();
    }

    const token = await this.repository.findLatestVerifiedByUserId(user.id);
    if (!token || !token.sessionTokenHash || !token.sessionExpiresAt) {
      throw genericFailure();
    }

    const now = this.clock.now();
    if (new Date(token.sessionExpiresAt).getTime() < now.getTime()) {
      throw genericFailure();
    }
    if (sha256Hex(resetToken) !== token.sessionTokenHash) {
      throw genericFailure();
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await this.usersService.updatePassword(user.id, passwordHash);
    // Single-use, and any other still-pending code/session for this user is
    // invalidated too — a successful reset always fully closes the loop.
    // (This system issues stateless JWTs with no server-side session store,
    // so existing login tokens remain valid until their natural expiry —
    // there is no revocation list to add them to without a larger,
    // out-of-scope architecture change.)
    await this.repository.invalidateAllForUser(user.id);
  }
}
