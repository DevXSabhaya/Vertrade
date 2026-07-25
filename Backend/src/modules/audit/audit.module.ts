import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AuditLogDocumentSchema,
  AuditLogMongooseSchema,
} from './audit-log.schema';
import { AuditLogRepository } from './audit-log.repository';
import { AuditLogSubscriber } from './audit-log.subscriber';
import { AUDIT_LOG_REPOSITORY } from './audit.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLogDocumentSchema.name, schema: AuditLogMongooseSchema },
    ]),
  ],
  providers: [
    { provide: AUDIT_LOG_REPOSITORY, useClass: AuditLogRepository },
    AuditLogSubscriber,
  ],
})
export class AuditModule {}
