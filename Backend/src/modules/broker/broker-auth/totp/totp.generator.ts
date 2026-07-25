import { createHmac } from 'node:crypto';
import { decodeBase32 } from './base32.util';

export interface TotpOptions {
  digits?: number;
  stepSeconds?: number;
  /** Milliseconds since epoch. Defaults to Date.now(); overridable for testing. */
  timestamp?: number;
}

/**
 * RFC 6238 (TOTP) / RFC 4226 (HOTP dynamic truncation) implementation.
 * Implemented in-house against Node's built-in crypto (no external dependency)
 * and verified against the official RFC 6238 Appendix B test vectors.
 */
export function generateTotp(
  base32Secret: string,
  options: TotpOptions = {},
): string {
  const digits = options.digits ?? 6;
  const stepSeconds = options.stepSeconds ?? 30;
  const timestamp = options.timestamp ?? Date.now();

  const counter = Math.floor(timestamp / 1000 / stepSeconds);
  const key = decodeBase32(base32Secret);

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;

  const binaryCode =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);

  const otp = (binaryCode % 10 ** digits).toString().padStart(digits, '0');
  return otp;
}
