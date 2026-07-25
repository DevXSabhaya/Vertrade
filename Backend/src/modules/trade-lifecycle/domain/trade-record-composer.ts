import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import { calculateUnrealizedPnl } from '@modules/trading-engine/domain/pnl.util';
import type { TradeExtension } from '../models/trade-extension.model';
import type { TradeRecord, TradingMode } from '../models/trade-record.model';
import { deriveTradeLifecycleStage } from './trade-lifecycle-mapper';
import { calculateRiskReward } from './risk-reward.util';

/**
 * Builds the composed "Trade Aggregate" read model on demand — never
 * persisted as-is. `markPrice` is the last known tick for the trade's
 * instrument (or null if none has been observed yet); `nowMs` drives
 * `positionDurationMs` off the injected clock rather than `Date.now()`.
 */
export function composeTradeRecord(
  snapshot: TradeSnapshot,
  extension: TradeExtension,
  markPrice: number | null,
  nowMs: number,
  mode: TradingMode,
): TradeRecord {
  const targetsHit = snapshot.targets.length - snapshot.remainingTargets.length;
  const currentTarget = targetsHit > 0 ? targetsHit : null;

  return {
    tradeId: snapshot.id,
    signalId: readSignalId(snapshot),
    brokerOrderId: snapshot.entryOrderId,
    brokerPositionId: extension.brokerPositionId,
    instrument: snapshot.tradingSymbol,
    exchange: snapshot.exchange,
    token: snapshot.instrumentToken,
    direction: snapshot.direction,
    entryPrice: snapshot.entryTriggerPrice,
    quantity: snapshot.quantity,
    filledQuantity: snapshot.filledQuantity,
    openQuantity: snapshot.openQuantity,
    exitedQuantity: snapshot.exitedQuantity,
    averagePrice: snapshot.entryFillPrice,
    exitPrice: snapshot.exitPrice,
    status: snapshot.state,
    lifecycleStage: deriveTradeLifecycleStage(snapshot, extension.exitReason),
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    targets: snapshot.targets,
    currentTarget,
    stopLoss: snapshot.initialStopLoss,
    currentStopLoss: snapshot.currentStopLoss,
    trailingEnabled: extension.trailingEnabled,
    trailingConfiguration: extension.trailingConfig,
    riskReward: calculateRiskReward(
      snapshot.direction,
      snapshot.entryTriggerPrice,
      snapshot.initialStopLoss,
      snapshot.targets[0],
    ),
    realizedPnl: snapshot.realizedPnl,
    unrealizedPnl:
      markPrice === null
        ? null
        : calculateUnrealizedPnl(
            snapshot.direction,
            snapshot.entryFillPrice,
            snapshot.filledQuantity,
            snapshot.openQuantity,
            markPrice,
          ),
    exitReason: extension.exitReason,
    brokerMetadata: extension.brokerMetadata,
    positionDurationMs: Math.max(
      0,
      nowMs - new Date(snapshot.createdAt).getTime(),
    ),
    mode,
  };
}

function readSignalId(snapshot: TradeSnapshot): string | null {
  const value = snapshot.metadata.signalId;
  return typeof value === 'string' ? value : null;
}
