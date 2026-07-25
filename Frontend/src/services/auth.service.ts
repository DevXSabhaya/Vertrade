import { apiFetch } from '@/lib/api-client'
import type {
  AuthResult,
  ForgotPasswordPayload,
  ForgotPasswordResponse,
  LoginPayload,
  MessageResponse,
  PublicUser,
  RegisterPayload,
  ResetPasswordPayload,
  VerifyResetCodePayload,
  VerifyResetCodeResponse,
} from '@/types/auth'

export const authService = {
  register(payload: RegisterPayload): Promise<AuthResult> {
    return apiFetch<AuthResult>('/auth/register', {
      method: 'POST',
      body: payload,
      anonymous: true,
    })
  },

  login(payload: LoginPayload): Promise<AuthResult> {
    return apiFetch<AuthResult>('/auth/login', {
      method: 'POST',
      body: payload,
      anonymous: true,
    })
  },

  me(signal?: AbortSignal): Promise<PublicUser> {
    return apiFetch<PublicUser>('/auth/me', { signal })
  },

  forgotPassword(payload: ForgotPasswordPayload): Promise<ForgotPasswordResponse> {
    return apiFetch<ForgotPasswordResponse>('/auth/forgot-password', {
      method: 'POST',
      body: payload,
      anonymous: true,
    })
  },

  /** Same request shape as `forgotPassword` — the caller (ForgotPassword wizard) already has the email from step 1 and never re-prompts for it. */
  resendResetCode(payload: ForgotPasswordPayload): Promise<ForgotPasswordResponse> {
    return apiFetch<ForgotPasswordResponse>('/auth/forgot-password/resend', {
      method: 'POST',
      body: payload,
      anonymous: true,
    })
  },

  verifyResetCode(payload: VerifyResetCodePayload): Promise<VerifyResetCodeResponse> {
    return apiFetch<VerifyResetCodeResponse>('/auth/forgot-password/verify', {
      method: 'POST',
      body: payload,
      anonymous: true,
    })
  },

  resetPassword(payload: ResetPasswordPayload): Promise<MessageResponse> {
    return apiFetch<MessageResponse>('/auth/reset-password', {
      method: 'POST',
      body: payload,
      anonymous: true,
    })
  },
}
