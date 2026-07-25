export interface PasswordResetToken {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly codeHash: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
  readonly attempts: number;
  readonly createdAt: string;
  readonly verifiedAt: string | null;
  readonly sessionTokenHash: string | null;
  readonly sessionExpiresAt: string | null;
}
