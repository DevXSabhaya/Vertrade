import type { UserStatus } from './user-status.enum';

/** The full persisted user record, including the password hash — never returned from an API response directly, only via {@link PublicUser}. */
export interface User {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastLoginAt: string | null;
}

/** The subset of {@link User} that is ever safe to expose in an HTTP response — no `passwordHash`. */
export type PublicUser = Omit<User, 'passwordHash'>;

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}
