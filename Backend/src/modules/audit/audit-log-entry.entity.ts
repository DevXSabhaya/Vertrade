export class AuditLogEntry {
  constructor(
    public readonly eventName: string,
    public readonly timestamp: string,
    public readonly correlationId?: string,
    public readonly payload?: unknown,
  ) {}
}
