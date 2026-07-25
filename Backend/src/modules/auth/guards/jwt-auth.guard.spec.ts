import type { ExecutionContext } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { UsersService } from '@modules/users/users.service';
import { UserStatus } from '@modules/users/models/user-status.enum';
import type { User } from '@modules/users/models/user.model';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextWithHeader(authorization?: string): ExecutionContext {
  const request = { headers: { authorization } } as unknown as Request;
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'a@b.com',
    passwordHash: 'hash',
    displayName: 'Alice',
    status: UserStatus.ACTIVE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
    ...overrides,
  };
}

describe('JwtAuthGuard', () => {
  it('rejects a request with no Authorization header', async () => {
    const jwt = { verifyAsync: jest.fn() } as unknown as JwtService;
    const users = { findById: jest.fn() } as unknown as UsersService;
    const guard = new JwtAuthGuard(jwt, users);

    await expect(
      guard.canActivate(contextWithHeader(undefined)),
    ).rejects.toThrow('Missing bearer token');
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a header that is not a Bearer token', async () => {
    const jwt = { verifyAsync: jest.fn() } as unknown as JwtService;
    const users = { findById: jest.fn() } as unknown as UsersService;
    const guard = new JwtAuthGuard(jwt, users);

    await expect(
      guard.canActivate(contextWithHeader('Basic abc123')),
    ).rejects.toThrow('Missing bearer token');
  });

  it('rejects an invalid/expired token', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockRejectedValue(new Error('jwt expired')),
    } as unknown as JwtService;
    const users = { findById: jest.fn() } as unknown as UsersService;
    const guard = new JwtAuthGuard(jwt, users);

    await expect(
      guard.canActivate(contextWithHeader('Bearer bad.token.here')),
    ).rejects.toThrow('Invalid or expired token');
  });

  it('rejects a token for a user that no longer exists', async () => {
    const jwt = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: 'user-1', email: 'a@b.com' }),
    } as unknown as JwtService;
    const users = {
      findById: jest.fn().mockRejectedValue(new Error('not found')),
    } as unknown as UsersService;
    const guard = new JwtAuthGuard(jwt, users);

    await expect(
      guard.canActivate(contextWithHeader('Bearer valid.token')),
    ).rejects.toThrow('Account is no longer active');
  });

  it('rejects a token for a DISABLED user', async () => {
    const jwt = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: 'user-1', email: 'a@b.com' }),
    } as unknown as JwtService;
    const users = {
      findById: jest
        .fn()
        .mockResolvedValue(user({ status: UserStatus.DISABLED })),
    } as unknown as UsersService;
    const guard = new JwtAuthGuard(jwt, users);

    await expect(
      guard.canActivate(contextWithHeader('Bearer valid.token')),
    ).rejects.toThrow('Account is no longer active');
  });

  it('accepts a valid token and attaches the authenticated user to the request', async () => {
    const jwt = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: 'user-1', email: 'a@b.com' }),
    } as unknown as JwtService;
    const users = {
      findById: jest.fn().mockResolvedValue(user()),
    } as unknown as UsersService;
    const guard = new JwtAuthGuard(jwt, users);

    const request = {
      headers: { authorization: 'Bearer valid.token' },
    } as unknown as Request & { user?: unknown };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({ userId: 'user-1', email: 'a@b.com' });
  });
});
