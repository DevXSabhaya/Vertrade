import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { UsersService } from '@modules/users/users.service';
import { UserStatus } from '@modules/users/models/user-status.enum';
import type { User } from '@modules/users/models/user.model';
import { EmailAlreadyRegisteredException } from '@modules/users/exceptions/email-already-registered.exception';
import { AuthService } from './auth.service';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';

function jwtService(): jest.Mocked<Pick<JwtService, 'signAsync'>> {
  return { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
}

function eventBus(): jest.Mocked<Pick<IEventBus, 'publish'>> {
  return { publish: jest.fn() };
}

async function buildUser(overrides: Partial<User> = {}): Promise<User> {
  return {
    id: 'user-1',
    email: 'a@b.com',
    passwordHash: await bcrypt.hash('correct-password', 4),
    displayName: 'Alice',
    status: UserStatus.ACTIVE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
    ...overrides,
  };
}

describe('AuthService', () => {
  it('register() hashes the password, creates the user, and never returns the hash', async () => {
    const usersService = {
      create: jest
        .fn()
        .mockImplementation((email, passwordHash, displayName) => ({
          id: 'user-1',
          email,
          passwordHash,
          displayName,
          status: UserStatus.ACTIVE,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          lastLoginAt: null,
        })),
    } as unknown as UsersService;
    const jwt = jwtService();
    const bus = eventBus();
    const service = new AuthService(
      usersService,
      jwt as unknown as JwtService,
      bus as unknown as IEventBus,
    );

    const result = await service.register({
      email: 'a@b.com',
      password: 'super-secret',
      displayName: 'Alice',
    });

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user.email).toBe('a@b.com');
    expect(
      (result.user as unknown as Record<string, unknown>).passwordHash,
    ).toBeUndefined();
    expect(usersService.create).toHaveBeenCalledWith(
      'a@b.com',
      expect.any(String),
      'Alice',
    );
    const [, hashArg] = (usersService.create as jest.Mock).mock.calls[0] as [
      string,
      string,
    ];
    expect(hashArg).not.toBe('super-secret');
    expect(bus.publish).toHaveBeenCalledTimes(1);
  });

  it('register() propagates duplicate-email rejection without issuing a token', async () => {
    const usersService = {
      create: jest
        .fn()
        .mockRejectedValue(
          new EmailAlreadyRegisteredException('already registered'),
        ),
    } as unknown as UsersService;
    const jwt = jwtService();
    const service = new AuthService(
      usersService,
      jwt as unknown as JwtService,
      eventBus() as unknown as IEventBus,
    );

    await expect(
      service.register({
        email: 'a@b.com',
        password: 'super-secret',
        displayName: 'Alice',
      }),
    ).rejects.toThrow(EmailAlreadyRegisteredException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('login() succeeds with correct credentials and records the login', async () => {
    const user = await buildUser();
    const usersService = {
      findByEmail: jest.fn().mockResolvedValue(user),
      recordLogin: jest.fn().mockResolvedValue({
        ...user,
        lastLoginAt: '2026-01-02T00:00:00.000Z',
      }),
    } as unknown as UsersService;
    const jwt = jwtService();
    const bus = eventBus();
    const service = new AuthService(
      usersService,
      jwt as unknown as JwtService,
      bus as unknown as IEventBus,
    );

    const result = await service.login({
      email: 'a@b.com',
      password: 'correct-password',
    });

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(usersService.recordLogin).toHaveBeenCalledWith('user-1');
    expect(bus.publish).toHaveBeenCalledTimes(1);
  });

  it('login() rejects an unknown email without revealing that it does not exist', async () => {
    const usersService = {
      findByEmail: jest.fn().mockResolvedValue(null),
    } as unknown as UsersService;
    const service = new AuthService(
      usersService,
      jwtService() as unknown as JwtService,
      eventBus() as unknown as IEventBus,
    );

    await expect(
      service.login({ email: 'nobody@example.com', password: 'whatever' }),
    ).rejects.toThrow(InvalidCredentialsException);
  });

  it('login() rejects an incorrect password', async () => {
    const user = await buildUser();
    const usersService = {
      findByEmail: jest.fn().mockResolvedValue(user),
    } as unknown as UsersService;
    const service = new AuthService(
      usersService,
      jwtService() as unknown as JwtService,
      eventBus() as unknown as IEventBus,
    );

    await expect(
      service.login({ email: 'a@b.com', password: 'wrong-password' }),
    ).rejects.toThrow(InvalidCredentialsException);
  });

  it('login() rejects a DISABLED account even with the correct password', async () => {
    const user = await buildUser({ status: UserStatus.DISABLED });
    const usersService = {
      findByEmail: jest.fn().mockResolvedValue(user),
    } as unknown as UsersService;
    const service = new AuthService(
      usersService,
      jwtService() as unknown as JwtService,
      eventBus() as unknown as IEventBus,
    );

    await expect(
      service.login({ email: 'a@b.com', password: 'correct-password' }),
    ).rejects.toThrow(InvalidCredentialsException);
  });
});
