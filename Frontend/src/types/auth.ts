export type UserStatus = 'ACTIVE' | 'DISABLED'

export interface PublicUser {
  readonly id: string
  readonly email: string
  readonly displayName: string
  readonly status: UserStatus
  readonly createdAt: string
  readonly updatedAt: string
  readonly lastLoginAt: string | null
}

export interface AuthResult {
  readonly accessToken: string
  readonly user: PublicUser
}

export interface RegisterPayload {
  readonly email: string
  readonly password: string
  readonly displayName: string
}

export interface LoginPayload {
  readonly email: string
  readonly password: string
}

export interface ForgotPasswordPayload {
  readonly email: string
}

export interface ForgotPasswordResponse {
  readonly message: string
  readonly cooldownSeconds: number
  /** UTC ISO timestamp — the backend's single source of truth for when the code expires. */
  readonly codeExpiresAt: string
}

export interface VerifyResetCodePayload {
  readonly email: string
  readonly code: string
}

export interface VerifyResetCodeResponse {
  readonly resetToken: string
  readonly expiresInSeconds: number
}

export interface ResetPasswordPayload {
  readonly email: string
  readonly resetToken: string
  readonly newPassword: string
}

export interface MessageResponse {
  readonly message: string
}
