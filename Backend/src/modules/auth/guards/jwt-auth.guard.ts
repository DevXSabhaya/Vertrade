import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { UsersService } from '@modules/users/users.service';
import { UserStatus } from '@modules/users/models/user-status.enum';
import type { JwtPayload } from '../models/jwt-payload.model';
import type { AuthenticatedUser } from '../models/authenticated-user.model';

const BEARER_PREFIX = 'Bearer ';

/**
 * The only authentication mechanism in this codebase (Phase 12, Part 1) —
 * hand-rolled rather than via `@nestjs/passport`, since a single JWT bearer
 * scheme doesn't need a strategy-plugin framework. Verifies the token,
 * re-confirms the user still exists and is not `DISABLED` (a token survives
 * account disablement until it expires otherwise), and attaches the verified
 * identity to `request.user` — every controller reads identity from there,
 * never from a request body/param, so a caller can never impersonate another
 * user by sending a different `userId`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.usersService
      .findById(payload.sub)
      .catch(() => null);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is no longer active');
    }

    const authenticatedUser: AuthenticatedUser = {
      userId: user.id,
      email: user.email,
    };
    (request as Request & { user: AuthenticatedUser }).user = authenticatedUser;
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      return null;
    }
    return header.slice(BEARER_PREFIX.length).trim() || null;
  }
}
