const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Decodes an RFC 4648 base32 string (as used for authenticator/TOTP secrets) into raw bytes. */
export function decodeBase32(input: string): Buffer {
  const cleaned = input.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');

  let bits = '';
  for (const char of cleaned) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid base32 character: "${char}"`);
    }
    bits += value.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** Encodes raw bytes as an RFC 4648 base32 string (no padding). Used mainly by tests/tooling. */
export function encodeBase32(buffer: Buffer): string {
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }

  let output = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5).padEnd(5, '0');
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return output;
}
