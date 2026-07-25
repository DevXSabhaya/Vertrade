import type { RiskReasonCode } from './risk-reason-code.enum';

/** A persisted record of one TradeRiskRejected outcome — backs `GET /risk/violations`. */
export interface RiskViolation {
  readonly id: string;
  readonly occurredAt: string;
  readonly reasonCode: RiskReasonCode;
  readonly message: string;
  readonly rawSymbol: string;
  readonly requestedQuantity: number;
  readonly correlationId: string | null;
}
