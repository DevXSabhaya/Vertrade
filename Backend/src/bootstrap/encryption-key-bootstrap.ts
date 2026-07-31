import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const KEY_FILE_NAME = 'token-encryption.key';
const DEFAULT_SECRETS_DIR_PRODUCTION = '/var/data/secrets';
const DEFAULT_SECRETS_DIR_DEVELOPMENT = './.local-secrets';

/**
 * Runs before Nest exists — `validateEnv()` reads `process.env.TOKEN_ENCRYPTION_KEY`
 * synchronously during `ConfigModule` bootstrap, so this has to populate it
 * (or fail loudly) before `NestFactory.create()` is ever called.
 *
 * Priority, per production requirement: (1) an already-set env var always
 * wins and is used as-is — this is what a Render env var provides. (2) a
 * previously-generated key file on a persistent disk — read and reused
 * forever, never regenerated, never overwritten. (3) only if neither exists
 * (true first boot): generate one, persist it once. If the target directory
 * can't be created/written, this throws — never silently falls back to an
 * in-memory/ephemeral key, since that would make every previously-encrypted
 * broker token permanently undecryptable on the next restart.
 */
export function bootstrapEncryptionKey(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.TOKEN_ENCRYPTION_KEY && env.TOKEN_ENCRYPTION_KEY.trim() !== '') {
    return;
  }

  const secretsDir =
    env.SECRETS_DIR?.trim() ||
    (env.NODE_ENV === 'production'
      ? DEFAULT_SECRETS_DIR_PRODUCTION
      : DEFAULT_SECRETS_DIR_DEVELOPMENT);
  const keyFilePath = join(secretsDir, KEY_FILE_NAME);

  if (existsSync(keyFilePath)) {
    const existing = readFileSync(keyFilePath, 'utf8').trim();
    if (existing === '') {
      throw new Error(
        `TOKEN_ENCRYPTION_KEY bootstrap failed: key file at "${keyFilePath}" exists but is empty. Refusing to generate a replacement automatically, since that could invalidate previously-encrypted broker tokens — investigate and fix the file, or set TOKEN_ENCRYPTION_KEY directly as an environment variable.`,
      );
    }
    env.TOKEN_ENCRYPTION_KEY = existing;
    return;
  }

  let generated: string;
  try {
    mkdirSync(dirname(keyFilePath), { recursive: true });
    generated = randomBytes(48).toString('base64');
    writeFileSync(keyFilePath, generated, { mode: 0o600 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `TOKEN_ENCRYPTION_KEY is not set and no persistent key file could be created at "${keyFilePath}" (${message}). ` +
        'Either attach a persistent disk mounted at the path in SECRETS_DIR (Render: Settings -> Disks), ' +
        'or set TOKEN_ENCRYPTION_KEY directly as an environment variable. ' +
        'Refusing to start with a temporary/ephemeral key, since that would make every previously-encrypted broker token unreadable after the next restart.',
    );
  }

  console.log(
    `[Bootstrap] Generated a new TOKEN_ENCRYPTION_KEY and persisted it to "${keyFilePath}". This key will be reused on every future restart from this same file — back up this disk, or set TOKEN_ENCRYPTION_KEY as an environment variable for a stronger guarantee.`,
  );
  env.TOKEN_ENCRYPTION_KEY = generated;
}
