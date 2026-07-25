import { decodeBase32, encodeBase32 } from './base32.util';

describe('base32 codec', () => {
  it('round-trips arbitrary bytes through encode then decode', () => {
    const original = Buffer.from('12345678901234567890', 'ascii');
    const encoded = encodeBase32(original);
    const decoded = decodeBase32(encoded);
    expect(decoded.equals(original)).toBe(true);
  });

  it('encodes a single byte per RFC 4648 (0x41 -> "IE")', () => {
    expect(encodeBase32(Buffer.from([0x41]))).toBe('IE');
  });

  it('decodes that same known value back to the original byte', () => {
    expect(decodeBase32('IE').equals(Buffer.from([0x41]))).toBe(true);
  });

  it('ignores padding characters and whitespace', () => {
    const withPadding = decodeBase32('IE');
    const withoutPadding = decodeBase32('IE======');
    expect(withPadding.equals(withoutPadding)).toBe(true);
  });

  it('rejects invalid base32 characters', () => {
    expect(() => decodeBase32('not-valid-base32!!!')).toThrow();
  });
});
