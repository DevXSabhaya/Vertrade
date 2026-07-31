import {
  mkdtempSync,
  rmSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapEncryptionKey } from './encryption-key-bootstrap';

describe('bootstrapEncryptionKey', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'token-key-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses an already-set env var as-is, without touching the filesystem', () => {
    const env: NodeJS.ProcessEnv = {
      TOKEN_ENCRYPTION_KEY: 'already-set-value',
      SECRETS_DIR: join(dir, 'does-not-exist'),
    };

    bootstrapEncryptionKey(env);

    expect(env.TOKEN_ENCRYPTION_KEY).toBe('already-set-value');
  });

  it('generates a new key exactly once and persists it to SECRETS_DIR on first boot', () => {
    const env: NodeJS.ProcessEnv = { SECRETS_DIR: dir };

    bootstrapEncryptionKey(env);

    expect(env.TOKEN_ENCRYPTION_KEY).toBeTruthy();
    const persisted = readFileSync(join(dir, 'token-encryption.key'), 'utf8');
    expect(persisted.trim()).toBe(env.TOKEN_ENCRYPTION_KEY);
  });

  it('reuses the persisted key on a subsequent boot instead of regenerating it', () => {
    const first: NodeJS.ProcessEnv = { SECRETS_DIR: dir };
    bootstrapEncryptionKey(first);
    const originalKey = first.TOKEN_ENCRYPTION_KEY;

    const second: NodeJS.ProcessEnv = { SECRETS_DIR: dir };
    bootstrapEncryptionKey(second);

    expect(second.TOKEN_ENCRYPTION_KEY).toBe(originalKey);
  });

  it('never overwrites an existing key file even across many repeated boots', () => {
    const first: NodeJS.ProcessEnv = { SECRETS_DIR: dir };
    bootstrapEncryptionKey(first);
    const originalKey = first.TOKEN_ENCRYPTION_KEY;

    for (let i = 0; i < 10; i += 1) {
      const env: NodeJS.ProcessEnv = { SECRETS_DIR: dir };
      bootstrapEncryptionKey(env);
      expect(env.TOKEN_ENCRYPTION_KEY).toBe(originalKey);
    }
  });

  it('throws a clear, actionable error instead of an ephemeral key when the directory cannot be created', () => {
    const unwritableParent = join(dir, 'blocked-file');
    writeFileSync(unwritableParent, 'not a directory');
    const env: NodeJS.ProcessEnv = {
      SECRETS_DIR: join(unwritableParent, 'nested'),
    };

    expect(() => bootstrapEncryptionKey(env)).toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(env.TOKEN_ENCRYPTION_KEY).toBeUndefined();
  });

  it('throws instead of silently regenerating when the key file exists but is empty', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'token-encryption.key'), '');
    const env: NodeJS.ProcessEnv = { SECRETS_DIR: dir };

    expect(() => bootstrapEncryptionKey(env)).toThrow(/empty/);
  });
});
