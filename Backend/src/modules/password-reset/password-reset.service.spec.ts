/* eslint-disable @typescript-eslint/require-await -- these in-memory fakes intentionally implement async repository/provider interfaces synchronously */
import { Test } from '@nestjs/testing';
import { LoggerService } from '@core/logger/logger.service';
import { CLOCK } from '@shared/clock/clock.constants';
import { FakeClock } from '@modules/users/testing/fake-clock';
import { UsersService } from '@modules/users/users.service';
import { USER_REPOSITORY } from '@modules/users/users.constants';
import type { IUserRepository } from '@modules/users/interfaces/user-repository.interface';
import type { User } from '@modules/users/models/user.model';
import { UserStatus } from '@modules/users/models/user-status.enum';
import { EMAIL_PROVIDER } from '@modules/email/email.constants';
import type {
  EmailMessage,
  IEmailProvider,
} from '@modules/email/interfaces/email-provider.interface';
import { PasswordResetService } from './password-reset.service';
import { PASSWORD_RESET_REPOSITORY } from './password-reset.constants';
import type { IPasswordResetRepository } from './interfaces/password-reset-repository.interface';
import type { PasswordResetToken } from './interfaces/password-reset-token.model';
import { InvalidResetCodeException } from './exceptions/invalid-reset-code.exception';
import { InvalidResetSessionException } from './exceptions/invalid-reset-session.exception';
import { TooManyResetRequestsException } from './exceptions/too-many-reset-requests.exception';
import { EmailDeliveryFailedException } from './exceptions/email-delivery-failed.exception';

const COOLDOWN_CLEAR_MS = 46_000;

class InMemoryUserRepository implements IUserRepository {
  private users = new Map<string, User>();

  seed(user: User): void {
    this.users.set(user.id, user);
  }

  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  async findById(userId: string): Promise<User | null> {
    return this.users.get(userId) ?? null;
  }
}

class InMemoryPasswordResetRepository implements IPasswordResetRepository {
  private tokens = new Map<string, PasswordResetToken>();
  private requests: { email: string; requestedAt: string }[] = [];
  private nextId = 1;

  async create(entry: {
    userId: string;
    email: string;
    codeHash: string;
    expiresAt: string;
    createdAt: string;
  }): Promise<PasswordResetToken> {
    const token: PasswordResetToken = {
      id: String(this.nextId++),
      usedAt: null,
      attempts: 0,
      verifiedAt: null,
      sessionTokenHash: null,
      sessionExpiresAt: null,
      ...entry,
    };
    this.tokens.set(token.id, token);
    return token;
  }

  async findLatestUnusedByUserId(
    userId: string,
  ): Promise<PasswordResetToken | null> {
    const candidates = [...this.tokens.values()]
      .filter((t) => t.userId === userId && t.usedAt === null)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return candidates[0] ?? null;
  }

  async findLatestVerifiedByUserId(
    userId: string,
  ): Promise<PasswordResetToken | null> {
    const candidates = [...this.tokens.values()]
      .filter(
        (t) =>
          t.userId === userId && t.usedAt === null && t.verifiedAt !== null,
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return candidates[0] ?? null;
  }

  async incrementAttempts(id: string): Promise<void> {
    const token = this.tokens.get(id);
    if (token) this.tokens.set(id, { ...token, attempts: token.attempts + 1 });
  }

  async markUsed(id: string): Promise<void> {
    const token = this.tokens.get(id);
    if (token)
      this.tokens.set(id, { ...token, usedAt: new Date().toISOString() });
  }

  async markVerified(
    id: string,
    sessionTokenHash: string,
    sessionExpiresAt: string,
  ): Promise<void> {
    const token = this.tokens.get(id);
    if (token) {
      this.tokens.set(id, {
        ...token,
        verifiedAt: new Date().toISOString(),
        sessionTokenHash,
        sessionExpiresAt,
      });
    }
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    for (const [id, token] of this.tokens) {
      if (token.userId === userId) this.tokens.delete(id);
    }
  }

  async recordRequestAttempt(
    email: string,
    requestedAt: string,
  ): Promise<void> {
    this.requests.push({ email, requestedAt });
  }

  async countRequestAttemptsSince(
    email: string,
    sinceIso: string,
  ): Promise<number> {
    return this.requests.filter(
      (r) => r.email === email && r.requestedAt >= sinceIso,
    ).length;
  }

  async findLastRequestAt(email: string): Promise<string | null> {
    const matches = this.requests
      .filter((r) => r.email === email)
      .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
    return matches[0]?.requestedAt ?? null;
  }
}

class InMemoryEmailProvider implements IEmailProvider {
  public readonly sent: EmailMessage[] = [];
  public failNext = false;

  async send(message: EmailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('SMTP connection refused');
    }
    this.sent.push(message);
  }

  lastCodeFor(to: string): string {
    const message = [...this.sent].reverse().find((m) => m.to === to);
    const match = message?.text.match(/\d{6}/);
    if (!match) throw new Error(`No code found for ${to}`);
    return match[0];
  }
}

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let userRepository: InMemoryUserRepository;
  let resetRepository: InMemoryPasswordResetRepository;
  let emailProvider: InMemoryEmailProvider;
  let clock: FakeClock;

  const existingUser: User = {
    id: 'user-1',
    email: 'existing@example.com',
    passwordHash: 'old-hash',
    displayName: 'Existing User',
    status: UserStatus.ACTIVE,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    lastLoginAt: null,
  };

  beforeEach(async () => {
    userRepository = new InMemoryUserRepository();
    userRepository.seed(existingUser);
    resetRepository = new InMemoryPasswordResetRepository();
    emailProvider = new InMemoryEmailProvider();
    clock = new FakeClock();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        UsersService,
        { provide: USER_REPOSITORY, useValue: userRepository },
        { provide: PASSWORD_RESET_REPOSITORY, useValue: resetRepository },
        { provide: EMAIL_PROVIDER, useValue: emailProvider },
        { provide: CLOCK, useValue: clock },
        LoggerService,
      ],
    }).compile();

    service = moduleRef.get(PasswordResetService);
  });

  async function requestAndGetCode(email: string): Promise<string> {
    await service.requestReset(email);
    return emailProvider.lastCodeFor(email);
  }

  async function requestVerifyAndGetSession(email: string): Promise<string> {
    const code = await requestAndGetCode(email);
    const { resetToken } = await service.verifyCode(email, code);
    return resetToken;
  }

  describe('requestReset', () => {
    it('sends a 6-digit code by email for an existing account', async () => {
      const code = await requestAndGetCode('existing@example.com');
      expect(code).toMatch(/^\d{6}$/);
    });

    it('does nothing but does not throw for an unknown email (no enumeration)', async () => {
      await expect(service.requestReset('nobody@example.com')).resolves.toEqual(
        { cooldownSeconds: 45, codeExpiresAt: expect.any(String) },
      );
      expect(emailProvider.sent).toHaveLength(0);
    });

    it('enforces a resend cooldown immediately after a request', async () => {
      await service.requestReset('existing@example.com');
      await expect(
        service.requestReset('existing@example.com'),
      ).rejects.toThrow(TooManyResetRequestsException);
    });

    it('enforces the cooldown for an unknown email too (same-shape behavior, no enumeration)', async () => {
      await service.requestReset('nobody@example.com');
      await expect(service.requestReset('nobody@example.com')).rejects.toThrow(
        TooManyResetRequestsException,
      );
    });

    it('allows a new request once the cooldown has elapsed', async () => {
      await service.requestReset('existing@example.com');
      clock.advanceBy(COOLDOWN_CLEAR_MS);
      await expect(
        service.requestReset('existing@example.com'),
      ).resolves.toEqual({
        cooldownSeconds: 45,
        codeExpiresAt: expect.any(String),
      });
    });

    it('rate-limits repeated requests beyond the abuse cap even with the cooldown cleared each time', async () => {
      for (let i = 0; i < 5; i += 1) {
        await service.requestReset('existing@example.com');
        clock.advanceBy(COOLDOWN_CLEAR_MS);
      }
      await expect(
        service.requestReset('existing@example.com'),
      ).rejects.toThrow(TooManyResetRequestsException);
    });

    it('invalidates a previous unused code when a new one is requested (resend semantics)', async () => {
      const firstCode = await requestAndGetCode('existing@example.com');
      clock.advanceBy(COOLDOWN_CLEAR_MS);
      await service.requestReset('existing@example.com');

      await expect(
        service.verifyCode('existing@example.com', firstCode),
      ).rejects.toThrow(InvalidResetCodeException);
    });

    it('sends the new code to the same email on a resend, without any new lookup input', async () => {
      await requestAndGetCode('existing@example.com');
      clock.advanceBy(COOLDOWN_CLEAR_MS);
      const secondCode = await requestAndGetCode('existing@example.com');

      const { resetToken } = await service.verifyCode(
        'existing@example.com',
        secondCode,
      );
      expect(resetToken).toEqual(expect.any(String));
    });

    it('surfaces a clear delivery error when the email provider fails, for a real account', async () => {
      emailProvider.failNext = true;
      await expect(
        service.requestReset('existing@example.com'),
      ).rejects.toThrow(EmailDeliveryFailedException);
    });

    it('never attempts to send (and never fails) for an unknown email even if the provider would fail', async () => {
      emailProvider.failNext = true;
      await expect(service.requestReset('nobody@example.com')).resolves.toEqual(
        { cooldownSeconds: 45, codeExpiresAt: expect.any(String) },
      );
    });
  });

  describe('OTP expiry contract (backend is the single source of truth)', () => {
    const FIFTEEN_MIN_MS = 15 * 60_000;

    it('returns a codeExpiresAt exactly RESET_TOKEN_TTL_MINUTES (15 minutes) after the request, matching the email copy', async () => {
      const before = clock.now().getTime();
      const result = await service.requestReset('existing@example.com');

      const expiresAtMs = new Date(result.codeExpiresAt).getTime();
      // FakeClock ticks +1ms per now() call, so allow a small deterministic
      // slack instead of exact equality against `before`.
      expect(expiresAtMs - before).toBeGreaterThanOrEqual(FIFTEEN_MIN_MS - 5);
      expect(expiresAtMs - before).toBeLessThanOrEqual(FIFTEEN_MIN_MS + 5);
    });

    it('is a valid UTC-parseable ISO timestamp, independent of local timezone', async () => {
      const result = await service.requestReset('existing@example.com');
      expect(result.codeExpiresAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(Number.isNaN(new Date(result.codeExpiresAt).getTime())).toBe(
        false,
      );
    });

    it('accepts the code at any point strictly before expiry', async () => {
      const code = await requestAndGetCode('existing@example.com');
      clock.advanceBy(FIFTEEN_MIN_MS - 1_000);

      await expect(
        service.verifyCode('existing@example.com', code),
      ).resolves.toEqual(
        expect.objectContaining({ resetToken: expect.any(String) }),
      );
    });

    it('rejects the code once 15 minutes have elapsed', async () => {
      const code = await requestAndGetCode('existing@example.com');
      clock.advanceBy(FIFTEEN_MIN_MS + 1_000);

      await expect(
        service.verifyCode('existing@example.com', code),
      ).rejects.toThrow(InvalidResetCodeException);
    });

    it('rejects a code immediately after it has already been used once (single-use)', async () => {
      const code = await requestAndGetCode('existing@example.com');
      await service.verifyCode('existing@example.com', code);

      await expect(
        service.verifyCode('existing@example.com', code),
      ).rejects.toThrow(InvalidResetCodeException);
    });

    it('a resend invalidates the previous code before it would have naturally expired', async () => {
      const firstCode = await requestAndGetCode('existing@example.com');
      clock.advanceBy(COOLDOWN_CLEAR_MS);
      await service.requestReset('existing@example.com');

      await expect(
        service.verifyCode('existing@example.com', firstCode),
      ).rejects.toThrow(InvalidResetCodeException);
    });

    it('a resend gets its own fresh 15-minute expiry window measured from the resend time, not the original request', async () => {
      await service.requestReset('existing@example.com');
      clock.advanceBy(COOLDOWN_CLEAR_MS);
      const resendBefore = clock.now().getTime();
      const resendResult = await service.requestReset('existing@example.com');

      const expiresAtMs = new Date(resendResult.codeExpiresAt).getTime();
      expect(expiresAtMs - resendBefore).toBeGreaterThanOrEqual(
        FIFTEEN_MIN_MS - 5,
      );
      expect(expiresAtMs - resendBefore).toBeLessThanOrEqual(
        FIFTEEN_MIN_MS + 5,
      );
    });
  });

  describe('verifyCode', () => {
    it('issues a reset session token for a correct code', async () => {
      const code = await requestAndGetCode('existing@example.com');
      const result = await service.verifyCode('existing@example.com', code);
      expect(result.resetToken).toEqual(expect.any(String));
      expect(result.resetToken.length).toBeGreaterThanOrEqual(32);
      expect(result.expiresInSeconds).toBeGreaterThan(0);
    });

    it('rejects an incorrect code', async () => {
      await service.requestReset('existing@example.com');
      await expect(
        service.verifyCode('existing@example.com', '000000'),
      ).rejects.toThrow(InvalidResetCodeException);
    });

    it('rejects an expired code', async () => {
      const code = await requestAndGetCode('existing@example.com');
      clock.advanceBy(16 * 60_000);

      await expect(
        service.verifyCode('existing@example.com', code),
      ).rejects.toThrow(InvalidResetCodeException);
    });

    it('rejects verification for an unknown email with the same generic error', async () => {
      await expect(
        service.verifyCode('nobody@example.com', '123456'),
      ).rejects.toThrow(InvalidResetCodeException);
    });

    it('locks out a code after too many wrong attempts', async () => {
      await service.requestReset('existing@example.com');
      for (let i = 0; i < 5; i += 1) {
        await expect(
          service.verifyCode('existing@example.com', '000000'),
        ).rejects.toThrow(InvalidResetCodeException);
      }
      const code = emailProvider.lastCodeFor('existing@example.com');
      await expect(
        service.verifyCode('existing@example.com', code),
      ).rejects.toThrow(InvalidResetCodeException);
    });

    it('cannot verify the same code twice', async () => {
      const code = await requestAndGetCode('existing@example.com');
      await service.verifyCode('existing@example.com', code);

      await expect(
        service.verifyCode('existing@example.com', code),
      ).rejects.toThrow(InvalidResetCodeException);
    });
  });

  describe('resetPassword', () => {
    it('resets the password with a valid session token and the old password stops working', async () => {
      const resetToken = await requestVerifyAndGetSession(
        'existing@example.com',
      );

      await service.resetPassword(
        'existing@example.com',
        resetToken,
        'brand-new-password',
      );

      const updated = await userRepository.findByEmail('existing@example.com');
      expect(updated?.passwordHash).not.toBe('old-hash');
    });

    it('requires successful verification first — a raw (unverified) code is never accepted as a session token', async () => {
      const code = await requestAndGetCode('existing@example.com');

      await expect(
        service.resetPassword(
          'existing@example.com',
          code,
          'brand-new-password',
        ),
      ).rejects.toThrow(InvalidResetSessionException);
    });

    it('rejects a wrong session token', async () => {
      await requestVerifyAndGetSession('existing@example.com');

      await expect(
        service.resetPassword(
          'existing@example.com',
          'a'.repeat(64),
          'brand-new-password',
        ),
      ).rejects.toThrow(InvalidResetSessionException);
    });

    it('rejects an expired session token', async () => {
      const resetToken = await requestVerifyAndGetSession(
        'existing@example.com',
      );
      clock.advanceBy(11 * 60_000);

      await expect(
        service.resetPassword(
          'existing@example.com',
          resetToken,
          'brand-new-password',
        ),
      ).rejects.toThrow(InvalidResetSessionException);
    });

    it('is single-use — the same session token cannot be used twice', async () => {
      const resetToken = await requestVerifyAndGetSession(
        'existing@example.com',
      );

      await service.resetPassword(
        'existing@example.com',
        resetToken,
        'brand-new-password',
      );

      await expect(
        service.resetPassword(
          'existing@example.com',
          resetToken,
          'another-password',
        ),
      ).rejects.toThrow(InvalidResetSessionException);
    });

    it('rejects a session token for an unknown email with the same generic error', async () => {
      await expect(
        service.resetPassword(
          'nobody@example.com',
          'a'.repeat(64),
          'brand-new-password',
        ),
      ).rejects.toThrow(InvalidResetSessionException);
    });

    it('invalidates the reset session after a successful password change', async () => {
      const resetToken = await requestVerifyAndGetSession(
        'existing@example.com',
      );
      await service.resetPassword(
        'existing@example.com',
        resetToken,
        'brand-new-password',
      );

      const stray = await resetRepository.findLatestVerifiedByUserId('user-1');
      expect(stray).toBeNull();
    });
  });
});
