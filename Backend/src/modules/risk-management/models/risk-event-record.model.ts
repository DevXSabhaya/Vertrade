/** A persisted, compact record of one risk-domain event — backs `GET /risk/events`, kept separate from the generic (whole-system) audit log so it can be queried cheaply by this module alone. */
export interface RiskEventRecord {
  readonly id: string;
  readonly eventName: string;
  readonly occurredAt: string;
  readonly correlationId: string | null;
  readonly tradeId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}
