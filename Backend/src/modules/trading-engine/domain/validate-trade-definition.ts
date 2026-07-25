import { Result } from '@shared/types/result';
import { TradeDirection } from './trade-direction.enum';
import type { CreateTradeParams } from './create-trade.params';

/**
 * A trade definition is rejected before a Trade even exists — no aggregate
 * to be in an invalid state, so this returns a Result rather than mutating
 * anything. Trade.create() converts a failure into a thrown
 * InvalidTradeDefinitionException.
 */
export function validateTradeDefinition(
  params: CreateTradeParams,
): Result<true, string> {
  if (!Number.isFinite(params.quantity) || params.quantity <= 0) {
    return Result.fail('Quantity must be a positive finite number');
  }
  if (
    !Number.isFinite(params.entryTriggerPrice) ||
    params.entryTriggerPrice <= 0
  ) {
    return Result.fail('Entry trigger price must be a positive finite number');
  }
  if (!Number.isFinite(params.initialStopLoss) || params.initialStopLoss <= 0) {
    return Result.fail('Initial stop loss must be a positive finite number');
  }
  if (params.targets.length === 0) {
    return Result.fail('At least one target is required');
  }
  if (
    !params.targets.every((target) => Number.isFinite(target) && target > 0)
  ) {
    return Result.fail('Every target must be a positive finite number');
  }
  if (
    !params.exchange.trim() ||
    !params.tradingSymbol.trim() ||
    !params.instrumentToken.trim()
  ) {
    return Result.fail(
      'Exchange, trading symbol, and instrument token are required',
    );
  }

  if (params.direction === TradeDirection.LONG) {
    if (params.initialStopLoss >= params.entryTriggerPrice) {
      return Result.fail(
        'A LONG stop loss must be below the entry trigger price',
      );
    }
    if (params.targets[0] <= params.entryTriggerPrice) {
      return Result.fail(
        'A LONG first target must be above the entry trigger price',
      );
    }
    for (let i = 1; i < params.targets.length; i += 1) {
      if (params.targets[i] <= params.targets[i - 1]) {
        return Result.fail('LONG targets must be strictly increasing');
      }
    }
  } else {
    if (params.initialStopLoss <= params.entryTriggerPrice) {
      return Result.fail(
        'A SHORT stop loss must be above the entry trigger price',
      );
    }
    if (params.targets[0] >= params.entryTriggerPrice) {
      return Result.fail(
        'A SHORT first target must be below the entry trigger price',
      );
    }
    for (let i = 1; i < params.targets.length; i += 1) {
      if (params.targets[i] >= params.targets[i - 1]) {
        return Result.fail('SHORT targets must be strictly decreasing');
      }
    }
  }

  return Result.ok(true);
}
