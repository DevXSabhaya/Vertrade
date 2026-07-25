import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { AuditLogEntry } from './audit-log-entry.entity';
import type { IAuditLogRepository } from './interfaces/audit-log-repository.interface';
import {
  AuditLogDocumentSchema,
  type AuditLogDocument,
} from './audit-log.schema';

@Injectable()
export class AuditLogRepository implements IAuditLogRepository {
  constructor(
    @InjectModel(AuditLogDocumentSchema.name)
    private readonly model: Model<AuditLogDocument>,
  ) {}

  async record(entry: AuditLogEntry): Promise<void> {
    await this.model.create({
      eventName: entry.eventName,
      timestamp: entry.timestamp,
      correlationId: entry.correlationId,
      payload: entry.payload,
    });
  }
}
