import { decrypt, encrypt } from './encryption.util';

describe('encryption util (AES-256-GCM)', () => {
  it('round-trips plaintext through encrypt then decrypt', () => {
    const plainText = 'super-secret-jwt-token-value';
    const cipherText = encrypt(plainText, 'correct-passphrase');

    expect(decrypt(cipherText, 'correct-passphrase')).toBe(plainText);
  });

  it('never stores the plaintext inside the encrypted payload', () => {
    const plainText = 'super-secret-jwt-token-value';
    const cipherText = encrypt(plainText, 'correct-passphrase');

    expect(cipherText).not.toContain(plainText);
  });

  it('produces a different ciphertext each time (random salt/IV)', () => {
    const first = encrypt('same-value', 'passphrase');
    const second = encrypt('same-value', 'passphrase');
    expect(first).not.toBe(second);
  });

  it('fails to decrypt with the wrong passphrase', () => {
    const cipherText = encrypt('secret', 'right-passphrase');
    expect(() => decrypt(cipherText, 'wrong-passphrase')).toThrow();
  });

  it('detects tampering via the GCM authentication tag', () => {
    const cipherText = encrypt('secret', 'passphrase');
    const parts = cipherText.split(':');
    const data = parts[3] ?? '';
    // Deterministically flip the first character to a different hex digit —
    // a fixed replacement (e.g. always 'f') would coincidentally be a no-op
    // whenever the original digit already happened to be 'f'.
    const flippedFirstChar = data[0] === '0' ? '1' : '0';
    const tampered = [
      parts[0],
      parts[1],
      parts[2],
      flippedFirstChar + data.slice(1),
    ].join(':');

    expect(() => decrypt(tampered, 'passphrase')).toThrow();
  });

  it('rejects a malformed payload', () => {
    expect(() => decrypt('not-a-valid-payload', 'passphrase')).toThrow();
  });
});
