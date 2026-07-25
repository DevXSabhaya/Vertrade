import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { UsersService } from '@modules/users/users.service';
import { UserRegisteredEvent } from '@modules/users/events/user-registered.event';
import { UserLoggedInEvent } from '@modules/users/events/user-logged-in.event';
import {
  toPublicUser,
  type PublicUser,
  type User,
} from '@modules/users/models/user.model';
import { UserStatus } from '@modules/users/models/user-status.enum';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './models/jwt-payload.model';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';

const BCRYPT_SALT_ROUNDS = 12;

export interface AuthResult {
  readonly accessToken: string;
  readonly user: PublicUser;
}

/**
 * The single use-case orchestrator for Phase 12's Part 1 requirements:
 * hashes/verifies passwords, issues JWTs, and publishes the audit-relevant
 * domain events — `UsersService` itself stays a pure persistence layer with
 * no knowledge of hashing or tokens.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.usersService.create(
      dto.email,
      passwordHash,
      dto.displayName,
    );
    this.eventBus.publish(new UserRegisteredEvent(user.id, user.email));
    return this.buildResult(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new InvalidCredentialsException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new InvalidCredentialsException('Invalid email or password');
    }

    const updated = await this.usersService.recordLogin(user.id);
    this.eventBus.publish(new UserLoggedInEvent(updated.id));
    return this.buildResult(updated);
  }

  private async buildResult(user: User): Promise<AuthResult> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken, user: toPublicUser(user) };
  }
}
