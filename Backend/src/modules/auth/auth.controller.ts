import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
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

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.authService.register(dto);
  }

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

  @Post('forgot-password/verify')
  @HttpCode(200)
  async verifyResetCode(
    @Body() dto: VerifyResetCodeDto,
  ): Promise<{ resetToken: string; expiresInSeconds: number }> {
    return this.passwordResetService.verifyCode(dto.email, dto.code);
  }

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
