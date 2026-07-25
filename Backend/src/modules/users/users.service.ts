import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { USER_REPOSITORY } from './users.constants';
import type { IUserRepository } from './interfaces/user-repository.interface';
import type { User } from './models/user.model';
import { UserStatus } from './models/user-status.enum';
import { EmailAlreadyRegisteredException } from './exceptions/email-already-registered.exception';
import { UserNotFoundException } from './exceptions/user-not-found.exception';

/**
 * Pure persistence + lookup for the user domain (Phase 12, Part 2). Never
 * hashes/verifies passwords itself and never issues tokens — that
 * use-case-level orchestration belongs to `AuthService`, which is the only
 * caller of `create()`/`recordLogin()`.
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repository: IUserRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async create(
    email: string,
    passwordHash: string,
    displayName: string,
  ): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.repository.findByEmail(normalizedEmail);
    if (existing) {
      throw new EmailAlreadyRegisteredException(
        `An account with email ${normalizedEmail} already exists`,
      );
    }

    const now = this.clock.now().toISOString();
    const user: User = {
      id: randomUUID(),
      email: normalizedEmail,
      passwordHash,
      displayName,
      status: UserStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };
    await this.repository.save(user);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findByEmail(email.trim().toLowerCase());
  }

  async findById(userId: string): Promise<User> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new UserNotFoundException(`No user found with id ${userId}`);
    }
    return user;
  }

  async recordLogin(userId: string): Promise<User> {
    const user = await this.findById(userId);
    const updated: User = {
      ...user,
      lastLoginAt: this.clock.now().toISOString(),
      updatedAt: this.clock.now().toISOString(),
    };
    await this.repository.save(updated);
    return updated;
  }

  /** Used only by the password-reset flow — never called with a plaintext password. */
  async updatePassword(userId: string, passwordHash: string): Promise<User> {
    const user = await this.findById(userId);
    const updated: User = {
      ...user,
      passwordHash,
      updatedAt: this.clock.now().toISOString(),
    };
    await this.repository.save(updated);
    return updated;
  }
}
