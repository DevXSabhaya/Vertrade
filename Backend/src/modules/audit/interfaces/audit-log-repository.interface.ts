import type { AuditLogEntry } from '../audit-log-entry.entity';

export interface IAuditLogRepository {
  record(entry: AuditLogEntry): Promise<void>;
}
