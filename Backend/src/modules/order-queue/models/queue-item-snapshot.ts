import type { ResolvedInstrument } from '@modules/instrument-resolver/resolved-instrument.vo';
import type { TradeValidationRequest } from '@modules/trade-validation/models/trade-validation-request.model';
import type { QueueItemState } from './queue-item-state.enum';
import type { QueueItemType } from './queue-item-type.enum';

export interface QueueItemHistoryEntry {
  readonly state: QueueItemState;
  readonly occurredAt: string;
  readonly reason?: string;
}

export interface QueueItemSnapshot {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly orderType: QueueItemType;
  readonly state: QueueItemState;
  readonly request: TradeValidationRequest;
  readonly resolvedInstrument: ResolvedInstrument;
  readonly attempts: number;
  readonly lockOwner: string | null;
  readonly lockedAt: string | null;
  readonly lastError: string | null;
  readonly resultTradeId: string | null;
  readonly history: readonly QueueItemHistoryEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
