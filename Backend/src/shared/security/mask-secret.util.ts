/**
 * Masks an arbitrary secret value for logging: shows only that it's present,
 * its length, and its first 4 characters (enough to eyeball "is this
 * obviously a placeholder / did this get truncated / is this the value I
 * think it is" without leaking enough to reconstruct the secret). Never
 * used for anything that isn't already known to be short-lived or
 * non-sensitive-enough-to-partially-show — GOOGLE_CLIENT_SECRET and
 * GOOGLE_REFRESH_TOKEN specifically, not access tokens (which are logged as
 * presence-only, see GoogleMailProvider).
 */
export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '(empty)';
  const prefix = trimmed.slice(0, 4);
  return `${prefix}...(${trimmed.length} chars)`;
}
