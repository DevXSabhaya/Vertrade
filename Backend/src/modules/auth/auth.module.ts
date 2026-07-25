import { Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { UsersModule } from '@modules/users/users.module';
import { PasswordResetModule } from '@modules/password-reset/password-reset.module';
import { ConfigModule } from '@core/config/config.module';
import { ConfigService } from '@core/config/config.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * Phase 12, Part 1 — the entire authentication surface. Hand-rolled JWT
 * bearer auth (no `@nestjs/passport`) since there is exactly one credential
 * type to support. `JwtAuthGuard` is exported so `PaperAccountModule`/
 * `PaperTradingModule` can protect their controllers without re-implementing
 * or duplicating token verification.
 */
@Module({
  imports: [
    UsersModule,
    PasswordResetModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.jwtSecret,
        signOptions: {
          expiresIn: configService.jwtExpiresIn as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  // `UsersModule`/`JwtModule` are re-exported (not just imported) because
  // `JwtAuthGuard` is applied elsewhere via `@UseGuards(JwtAuthGuard)` —
  // Nest resolves a guard referenced by class token against the *consuming*
  // module's own DI graph, so `PaperTradingModule` needs a direct path to
  // `JwtService`/`UsersService` too, not just to the guard's exported
  // singleton.
  exports: [JwtAuthGuard, JwtModule, UsersModule],
})
export class AuthModule {}
