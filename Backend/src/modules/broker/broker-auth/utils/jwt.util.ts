/**
 * Reads the `exp` claim out of a JWT's payload without verifying the
 * signature — we don't hold Angel One's signing key, we're only extracting
 * our own bookkeeping expiry, never trusting the token for authorization.
 */
export function decodeJwtExpiry(jwtToken: string): Date | null {
  const parts = jwtToken.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload: unknown = JSON.parse(payloadJson);

    if (
      typeof payload === 'object' &&
      payload !== null &&
      'exp' in payload &&
      typeof payload.exp === 'number'
    ) {
      return new Date((payload as { exp: number }).exp * 1000);
    }
  } catch {
    return null;
  }

  return null;
}
