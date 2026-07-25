import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CLOCK } from '@shared/clock/clock.constants';
import { SystemClock } from '@shared/clock/system-clock';
import { UsersService } from './users.service';
import { USER_REPOSITORY } from './users.constants';
import { UserRepository } from './repository/user.repository';
import { UserDocumentSchema, UserMongooseSchema } from './schema/user.schema';

/**
 * Phase 12 — the user domain. Deliberately minimal (Part 2 of the spec
 * explicitly rules out social login/OAuth for this phase): persistence and
 * lookup only. Password hashing and JWT issuance live in `AuthModule`, which
 * imports this module rather than duplicating user storage.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserDocumentSchema.name, schema: UserMongooseSchema },
    ]),
  ],
  providers: [
    UsersService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: USER_REPOSITORY, useClass: UserRepository },
  ],
  exports: [UsersService],
})
export class UsersModule {}
