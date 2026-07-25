import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { UsersModule } from '@modules/users/users.module';
import { EmailModule } from '@modules/email/email.module';
import { PasswordResetService } from './password-reset.service';
import { PASSWORD_RESET_REPOSITORY } from './password-reset.constants';
import { PasswordResetRepository } from './repository/password-reset.repository';
import {
  PasswordResetTokenDocumentSchema,
  PasswordResetTokenMongooseSchema,
} from './schema/password-reset-token.schema';
import {
  PasswordResetRequestDocumentSchema,
  PasswordResetRequestMongooseSchema,
} from './schema/password-reset-request.schema';

@Module({
  imports: [
    UsersModule,
    EmailModule,
    MongooseModule.forFeature([
      {
        name: PasswordResetTokenDocumentSchema.name,
        schema: PasswordResetTokenMongooseSchema,
      },
      {
        name: PasswordResetRequestDocumentSchema.name,
        schema: PasswordResetRequestMongooseSchema,
      },
    ]),
  ],
  providers: [
    PasswordResetService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: PASSWORD_RESET_REPOSITORY, useClass: PasswordResetRepository },
  ],
  exports: [PasswordResetService],
})
export class PasswordResetModule {}
