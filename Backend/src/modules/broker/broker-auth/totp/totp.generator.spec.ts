import { generateTotp } from './totp.generator';
import { encodeBase32 } from './base32.util';

/**
 * Verified against the official RFC 6238 Appendix B test vectors (SHA1, 8-digit,
 * 30s step, secret = ASCII "12345678901234567890"). We derive the base32 form
 * ourselves via encodeBase32 rather than hardcoding it, so this test validates
 * the entire encode -> decode -> HMAC -> truncate pipeline against an
 * authoritative external reference, not just internal self-consistency.
 */
describe('generateTotp (RFC 6238 vectors)', () => {
  const secretBase32 = encodeBase32(
    Buffer.from('12345678901234567890', 'ascii'),
  );

  const vectors: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ];

  it.each(vectors)(
    'produces %s at unix time %s (8 digits)',
    (unixSeconds, expectedOtp) => {
      const otp = generateTotp(secretBase32, {
        digits: 8,
        stepSeconds: 30,
        timestamp: unixSeconds * 1000,
      });
      expect(otp).toBe(expectedOtp);
    },
  );

  it('defaults to 6 digits and a 30 second step', () => {
    const otp = generateTotp(secretBase32, { timestamp: 59 * 1000 });
    expect(otp).toHaveLength(6);
    // The last 6 digits of the RFC's 8-digit vector for T=59 must match, since
    // dynamic truncation modulo 10^6 is just the low 6 digits of the same value.
    expect(otp).toBe('94287082'.slice(-6));
  });

  it('produces a different code once the time step advances', () => {
    const first = generateTotp(secretBase32, { timestamp: 59 * 1000 });
    const second = generateTotp(secretBase32, { timestamp: 90 * 1000 });
    expect(first).not.toBe(second);
  });
});
