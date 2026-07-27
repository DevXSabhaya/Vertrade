import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from '@modules/users/users.service';
import {
  toPublicUser,
  type PublicUser,
} from '@modules/users/models/user.model';
import { PasswordResetService } from '@modules/password-reset/password-reset.service';
import { ForgotPasswordDto } from '@modules/password-reset/dto/forgot-password.dto';
import { VerifyResetCodeDto } from '@modules/password-reset/dto/verify-reset-code.dto';
import { ResetPasswordDto } from '@modules/password-reset/dto/reset-password.dto';
import { AuthService, type AuthResult } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './models/authenticated-user.model';

/**
 * Phase 12, Part 1/7. `whitelist: true, forbidNonWhitelisted: true` on the
 * global `ValidationPipe` (`src/main.ts`) means every DTO field is validated
 * and unknown fields are rejected — a request body cannot smuggle in a
 * `userId`/`status`/`role` field the client shouldn't control.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  /** Phase 20 hardening: limits automated account creation from a single IP, independent of the DB-level unique-email constraint. Looser than login's limit — registration is naturally bursty (e.g. a shared-IP office/household signing up together), so this only needs to catch genuinely automated abuse, not brute-force credential guessing. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.authService.register(dto);
  }

  /** Phase 20 hardening: brute-force protection — caps credential-guessing attempts from a single IP regardless of which email is targeted. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<PublicUser> {
    const fullUser = await this.usersService.findById(user.userId);
    return toPublicUser(fullUser);
  }

  /**
   * Always 202 regardless of whether the email has an account or was
   * rate-limited into a no-op — the response must never let a caller
   * distinguish those cases. An `EmailDeliveryFailedException` is the one
   * exception: it only ever fires for an account that genuinely exists and
   * whose email genuinely failed to send, which is an infrastructure signal
   * the frontend needs to surface, not an account-existence leak.
   */
  /** Phase 20 hardening: per-IP cap, independent of PasswordResetService's existing per-email resend cooldown/abuse window — this stops one IP from cycling through many different email addresses. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{
    message: string;
    cooldownSeconds: number;
    codeExpiresAt: string;
  }> {
    const { cooldownSeconds, codeExpiresAt } =
      await this.passwordResetService.requestReset(dto.email);
    return {
      message:
        'If an account exists for that email, a password reset code has been sent.',
      cooldownSeconds,
      codeExpiresAt,
    };
  }

  /**
   * Identical semantics to `forgot-password` — the frontend already has the
   * email from step 1 and never re-prompts for it, but the request body
   * still carries it (the backend has no server-side session of its own to
   * key off instead).
   */
  /** Phase 20 hardening: same per-IP cap as forgot-password. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('forgot-password/resend')
  @HttpCode(202)
  async resendResetCode(@Body() dto: ForgotPasswordDto): Promise<{
    message: string;
    cooldownSeconds: number;
    codeExpiresAt: string;
  }> {
    const { cooldownSeconds, codeExpiresAt } =
      await this.passwordResetService.requestReset(dto.email);
    return {
      message: 'A new verification code has been sent to your email.',
      cooldownSeconds,
      codeExpiresAt,
    };
  }

  /** Phase 20 hardening: brute-force protection against guessing the 6-digit OTP — independent of PasswordResetService's existing per-token max-attempts lockout. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('forgot-password/verify')
  @HttpCode(200)
  async verifyResetCode(
    @Body() dto: VerifyResetCodeDto,
  ): Promise<{ resetToken: string; expiresInSeconds: number }> {
    return this.passwordResetService.verifyCode(dto.email, dto.code);
  }

  /** Phase 22 hardening: brute-force protection on the final reset step — was previously covered only by the global default (100/min) while every other step in this flow has its own tighter per-IP cap. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.passwordResetService.resetPassword(
      dto.email,
      dto.resetToken,
      dto.newPassword,
    );
    return { message: 'Password reset successfully.' };
  }
}
