import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

/**
 * AES-256-GCM with a random salt + IV per call (Node's built-in crypto only —
 * no external dependency). The passphrase-derived key never leaves this
 * function; the returned string is safe to persist as-is.
 */
export function encrypt(plainText: string, passphrase: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = scryptSync(passphrase, salt, KEY_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [salt, iv, authTag, encrypted]
    .map((buffer) => buffer.toString('hex'))
    .join(':');
}

export function decrypt(cipherText: string, passphrase: string): string {
  const parts = cipherText.split(':');
  if (parts.length !== 4) {
    throw new Error('Malformed encrypted payload');
  }
  const [saltHex, ivHex, authTagHex, dataHex] = parts as [
    string,
    string,
    string,
    string,
  ];

  const key = scryptSync(passphrase, Buffer.from(saltHex, 'hex'), KEY_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
