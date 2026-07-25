import type { IUserRepository } from './interfaces/user-repository.interface';
import { UsersService } from './users.service';
import { UserStatus } from './models/user-status.enum';
import type { User } from './models/user.model';
import { EmailAlreadyRegisteredException } from './exceptions/email-already-registered.exception';
import { UserNotFoundException } from './exceptions/user-not-found.exception';
import { FakeClock } from './testing/fake-clock';

function repository(users: User[] = []): jest.Mocked<IUserRepository> {
  return {
    save: jest.fn().mockImplementation((user: User) => {
      const idx = users.findIndex((u) => u.id === user.id);
      if (idx >= 0) {
        users[idx] = user;
      } else {
        users.push(user);
      }
      return Promise.resolve();
    }),
    findByEmail: jest
      .fn()
      .mockImplementation((email: string) =>
        Promise.resolve(users.find((u) => u.email === email) ?? null),
      ),
    findById: jest
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(users.find((u) => u.id === id) ?? null),
      ),
  };
}

describe('UsersService', () => {
  it('creates a new user with ACTIVE status and no lastLoginAt', async () => {
    const service = new UsersService(repository(), new FakeClock());
    const user = await service.create('a@b.com', 'hash', 'Alice');
    expect(user.email).toBe('a@b.com');
    expect(user.status).toBe(UserStatus.ACTIVE);
    expect(user.lastLoginAt).toBeNull();
  });

  it('normalizes email to lowercase/trimmed', async () => {
    const service = new UsersService(repository(), new FakeClock());
    const user = await service.create('  A@B.COM  ', 'hash', 'Alice');
    expect(user.email).toBe('a@b.com');
  });

  it('rejects registration with a duplicate email', async () => {
    const repo = repository();
    const service = new UsersService(repo, new FakeClock());
    await service.create('a@b.com', 'hash', 'Alice');

    await expect(service.create('a@b.com', 'hash2', 'Alice2')).rejects.toThrow(
      EmailAlreadyRegisteredException,
    );
  });

  it('findByEmail returns null when no user matches', async () => {
    const service = new UsersService(repository(), new FakeClock());
    expect(await service.findByEmail('nobody@example.com')).toBeNull();
  });

  it('findById throws UserNotFoundException when missing', async () => {
    const service = new UsersService(repository(), new FakeClock());
    await expect(service.findById('missing')).rejects.toThrow(
      UserNotFoundException,
    );
  });

  it('recordLogin sets lastLoginAt and persists it', async () => {
    const repo = repository();
    const service = new UsersService(repo, new FakeClock());
    const user = await service.create('a@b.com', 'hash', 'Alice');

    const updated = await service.recordLogin(user.id);

    expect(updated.lastLoginAt).not.toBeNull();
    const persisted = await service.findById(user.id);
    expect(persisted.lastLoginAt).toBe(updated.lastLoginAt);
  });
});
