export const PASSWORD_RESET_REPOSITORY = Symbol('PASSWORD_RESET_REPOSITORY');

/** How long a generated code stays valid. */
export const RESET_TOKEN_TTL_MINUTES = 15;
/** How many wrong-code attempts a single token tolerates before it's discarded. */
export const RESET_TOKEN_MAX_ATTEMPTS = 5;
/** How many forgot-password/resend requests a single email may make in the rate-limit window — the hard abuse cap. */
export const RESET_REQUEST_RATE_LIMIT = 5;
export const RESET_REQUEST_RATE_LIMIT_WINDOW_MINUTES = 15;
/** Minimum gap between requests for the same email — the faster-triggering, UX-facing "Resend code in Ns" cooldown. */
export const RESEND_COOLDOWN_SECONDS = 45;
/** How long the short-lived reset session (issued after successful code verification) stays valid for the actual password change. */
export const RESET_SESSION_TTL_MINUTES = 10;
