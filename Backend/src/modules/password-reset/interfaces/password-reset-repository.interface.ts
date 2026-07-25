import type { PasswordResetToken } from './password-reset-token.model';

export interface IPasswordResetRepository {
  create(entry: {
    userId: string;
    email: string;
    codeHash: string;
    expiresAt: string;
    createdAt: string;
  }): Promise<PasswordResetToken>;

  /** Most recently created unused token for this user, if any (regardless of expiry — the service decides what "invalid" means). */
  findLatestUnusedByUserId(userId: string): Promise<PasswordResetToken | null>;

  incrementAttempts(id: string): Promise<void>;
  markUsed(id: string): Promise<void>;

  /** Marks a token as verified and attaches a short-lived reset-session hash — the only state that authorizes the actual `resetPassword` call. */
  markVerified(
    id: string,
    sessionTokenHash: string,
    sessionExpiresAt: string,
  ): Promise<void>;

  /** Most recently created, verified-and-unused token for this user whose session hash matches — used only by `resetPassword`. */
  findLatestVerifiedByUserId(
    userId: string,
  ): Promise<PasswordResetToken | null>;

  /** Deletes every unused token for this user — used both to keep a single active token per user and to invalidate everything after a successful reset. */
  invalidateAllForUser(userId: string): Promise<void>;

  recordRequestAttempt(email: string, requestedAt: string): Promise<void>;
  countRequestAttemptsSince(email: string, sinceIso: string): Promise<number>;
  /** Most recent request timestamp for this email, if any — drives the resend cooldown independent of the longer abuse-rate window. */
  findLastRequestAt(email: string): Promise<string | null>;
}
