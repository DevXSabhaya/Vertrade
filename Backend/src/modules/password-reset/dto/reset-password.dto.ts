import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  /** The short-lived session token returned by `POST /auth/forgot-password/verify` — never the raw OTP code. */
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  resetToken!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
