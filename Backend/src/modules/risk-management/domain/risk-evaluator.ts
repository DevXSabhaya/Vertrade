import type { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import {
  DailyLossLimitType,
  DuplicateInstrumentPolicy,
  type RiskPolicy,
} from '../models/risk-policy.model';
import { RiskReasonCode } from '../models/risk-reason-code.enum';
import { KillSwitchStatus } from '../models/kill-switch-status.enum';
import {
  CircuitBreakerName,
  CircuitBreakerStatus,
  type CircuitBreakerSnapshot,
} from '../models/circuit-breaker.model';
import type { CooldownState } from '../models/cooldown.model';
import type { DailyRiskState } from '../models/daily-risk-state.model';
import type { RiskSnapshot } from '../models/risk-snapshot.model';
import type { RiskDecision } from '../models/risk-decision.model';
import type { TradeRiskContext } from '../models/trade-risk-context.model';
import {
  calculateExposure,
  calculatePointRisk,
  calculateRiskPercentage,
  calculateRupeeRisk,
} from './risk-calculations.util';

/** The minimal shape of an existing open position the evaluator needs — deliberately narrower than the full `TradeRecord` so this file stays independent of the trade-lifecycle module's types. */
export interface OpenPositionView {
  readonly instrumentToken: string;
  readonly direction: TradeDirection;
  readonly quantity: number;
  readonly exposure: number;
  readonly capitalUsed: number;
}

export interface RiskEvaluationInput {
  readonly policy: RiskPolicy;
  readonly context: TradeRiskContext;
  readonly openPositions: readonly OpenPositionView[];
  readonly dailyRiskState: DailyRiskState;
  readonly cooldown: CooldownState | null;
  readonly killSwitchStatus: KillSwitchStatus;
  readonly emergencyStopActive: boolean;
  readonly circuitBreakers: readonly CircuitBreakerSnapshot[];
  readonly nowIso: string;
  readonly riskSnapshot: RiskSnapshot;
}

function approve(snapshot: RiskSnapshot, nowIso: string): RiskDecision {
  return {
    allowed: true,
    reasonCode: null,
    message: 'Trade approved by risk management',
    evaluatedAt: nowIso,
    riskSnapshot: snapshot,
  };
}

function reject(
  reasonCode: RiskReasonCode,
  message: string,
  snapshot: RiskSnapshot,
  nowIso: string,
): RiskDecision {
  return {
    allowed: false,
    reasonCode,
    message,
    evaluatedAt: nowIso,
    riskSnapshot: snapshot,
  };
}

function breakerStatus(
  breakers: readonly CircuitBreakerSnapshot[],
  name: CircuitBreakerName,
): CircuitBreakerStatus {
  return (
    breakers.find((b) => b.name === name)?.status ?? CircuitBreakerStatus.CLOSED
  );
}

/**
 * The pure decision function at the heart of the Risk Management Engine
 * (Phase 11). Every control the spec lists is checked here, in a fixed,
 * most-severe-first order, stopping at the first breach — mirroring
 * TradeValidationEngine's own "stop at first failure" pipeline (Phase 7).
 * No I/O, no DI: `RiskEvaluationService` gathers `RiskEvaluationInput` from
 * the various stateful services and calls this function, so every rule here
 * is independently unit-testable with plain object literals.
 */
export function evaluateTradeRisk(input: RiskEvaluationInput): RiskDecision {
  const { policy, context, riskSnapshot, nowIso } = input;

  if (input.emergencyStopActive) {
    return reject(
      RiskReasonCode.EMERGENCY_STOP_ACTIVE,
      'Emergency stop is active: no new trades are accepted',
      riskSnapshot,
      nowIso,
    );
  }

  if (input.killSwitchStatus !== KillSwitchStatus.ACTIVE) {
    return reject(
      RiskReasonCode.KILL_SWITCH_ACTIVE,
      `The kill switch is engaged (${input.killSwitchStatus}): no new trades are accepted`,
      riskSnapshot,
      nowIso,
    );
  }

  if (
    breakerStatus(input.circuitBreakers, CircuitBreakerName.BROKER) !==
    CircuitBreakerStatus.CLOSED
  ) {
    return reject(
      RiskReasonCode.BROKER_UNAVAILABLE,
      'The broker circuit breaker is open: broker connectivity is currently unreliable',
      riskSnapshot,
      nowIso,
    );
  }

  if (
    breakerStatus(input.circuitBreakers, CircuitBreakerName.MARKET_DATA) !==
    CircuitBreakerStatus.CLOSED
  ) {
    return reject(
      RiskReasonCode.MARKET_DATA_UNAVAILABLE,
      'The market data circuit breaker is open: price data is currently unreliable',
      riskSnapshot,
      nowIso,
    );
  }

  if (
    breakerStatus(input.circuitBreakers, CircuitBreakerName.ORDER_EXECUTION) !==
    CircuitBreakerStatus.CLOSED
  ) {
    return reject(
      RiskReasonCode.CIRCUIT_BREAKER_OPEN,
      'The order execution circuit breaker is open: order placement is currently unreliable',
      riskSnapshot,
      nowIso,
    );
  }

  if (input.cooldown !== null) {
    return reject(
      RiskReasonCode.COOLDOWN_ACTIVE,
      `A cooldown is active (${input.cooldown.reason}) until ${input.cooldown.expiresAt}`,
      riskSnapshot,
      nowIso,
    );
  }

  if (input.dailyRiskState.consecutiveLosses >= policy.maxConsecutiveLosses) {
    return reject(
      RiskReasonCode.MAX_CONSECUTIVE_LOSSES_REACHED,
      `Maximum consecutive losses reached (${policy.maxConsecutiveLosses})`,
      riskSnapshot,
      nowIso,
    );
  }

  const dailyLossLimit =
    policy.maxDailyLossType === DailyLossLimitType.PERCENTAGE
      ? (policy.maxDailyLoss / 100) * policy.dailyRiskCapital
      : policy.maxDailyLoss;
  if (input.dailyRiskState.realizedPnl <= -dailyLossLimit) {
    return reject(
      RiskReasonCode.DAILY_LOSS_LIMIT_BREACHED,
      `Daily loss limit reached (limit ${dailyLossLimit}, realized ${input.dailyRiskState.realizedPnl})`,
      riskSnapshot,
      nowIso,
    );
  }

  if (input.openPositions.length >= policy.maxOpenTrades) {
    return reject(
      RiskReasonCode.MAX_OPEN_TRADES_REACHED,
      `Maximum open trades reached (${policy.maxOpenTrades})`,
      riskSnapshot,
      nowIso,
    );
  }

  const quantityCheck = checkQuantity(policy, context, input.openPositions);
  if (quantityCheck) {
    return reject(
      RiskReasonCode.MAX_QUANTITY_EXCEEDED,
      quantityCheck,
      riskSnapshot,
      nowIso,
    );
  }

  const exposure = calculateExposure(
    context.entryTriggerPrice,
    context.quantity,
  );
  const exposureCheck = checkExposure(
    policy,
    context,
    exposure,
    input.openPositions,
  );
  if (exposureCheck) {
    return reject(
      RiskReasonCode.MAX_EXPOSURE_REACHED,
      exposureCheck,
      riskSnapshot,
      nowIso,
    );
  }

  const capitalCheck = checkCapital(
    policy,
    context,
    exposure,
    input.openPositions,
  );
  if (capitalCheck) {
    return reject(
      RiskReasonCode.MAX_CAPITAL_EXCEEDED,
      capitalCheck,
      riskSnapshot,
      nowIso,
    );
  }

  const pointRisk = calculatePointRisk(
    context.direction,
    context.entryTriggerPrice,
    context.initialStopLoss,
  );
  const rupeeRisk = calculateRupeeRisk(pointRisk, context.quantity);
  const riskPercentage = calculateRiskPercentage(
    rupeeRisk,
    policy.dailyRiskCapital,
  );
  if (rupeeRisk > policy.maxRiskPerTrade) {
    return reject(
      RiskReasonCode.MAX_RISK_PER_TRADE_EXCEEDED,
      `Risk per trade (₹${rupeeRisk}) exceeds the configured maximum (₹${policy.maxRiskPerTrade})`,
      riskSnapshot,
      nowIso,
    );
  }
  if (riskPercentage > policy.maxRiskPerTradePercentage) {
    return reject(
      RiskReasonCode.MAX_RISK_PER_TRADE_EXCEEDED,
      `Risk per trade (${riskPercentage.toFixed(2)}%) exceeds the configured maximum (${policy.maxRiskPerTradePercentage}%)`,
      riskSnapshot,
      nowIso,
    );
  }

  const duplicateCheck = checkDuplicatePosition(
    policy,
    context,
    input.openPositions,
  );
  if (duplicateCheck) {
    return reject(
      RiskReasonCode.DUPLICATE_POSITION,
      duplicateCheck,
      riskSnapshot,
      nowIso,
    );
  }

  return approve(riskSnapshot, nowIso);
}

function checkQuantity(
  policy: RiskPolicy,
  context: TradeRiskContext,
  openPositions: readonly OpenPositionView[],
): string | null {
  if (context.quantity > policy.maxQuantityPerTrade) {
    return `Requested quantity (${context.quantity}) exceeds the maximum allowed per trade (${policy.maxQuantityPerTrade})`;
  }

  const instrumentQuantity =
    openPositions
      .filter((p) => p.instrumentToken === context.instrumentToken)
      .reduce((sum, p) => sum + p.quantity, 0) + context.quantity;
  if (instrumentQuantity > policy.maxQuantityPerInstrument) {
    return `Total quantity on ${context.tradingSymbol} (${instrumentQuantity}) would exceed the maximum allowed per instrument (${policy.maxQuantityPerInstrument})`;
  }

  const globalQuantity =
    openPositions.reduce((sum, p) => sum + p.quantity, 0) + context.quantity;
  if (globalQuantity > policy.maxQuantityGlobal) {
    return `Total open quantity across all instruments (${globalQuantity}) would exceed the global maximum (${policy.maxQuantityGlobal})`;
  }

  return null;
}

function checkExposure(
  policy: RiskPolicy,
  context: TradeRiskContext,
  proposedExposure: number,
  openPositions: readonly OpenPositionView[],
): string | null {
  if (proposedExposure > policy.maxExposurePerTrade) {
    return `Trade exposure (₹${proposedExposure}) exceeds the maximum allowed per trade (₹${policy.maxExposurePerTrade})`;
  }

  const instrumentExposure =
    openPositions
      .filter((p) => p.instrumentToken === context.instrumentToken)
      .reduce((sum, p) => sum + p.exposure, 0) + proposedExposure;
  if (instrumentExposure > policy.maxExposurePerInstrument) {
    return `Total exposure on ${context.tradingSymbol} (₹${instrumentExposure}) would exceed the maximum allowed per instrument (₹${policy.maxExposurePerInstrument})`;
  }

  const totalExposure =
    openPositions.reduce((sum, p) => sum + p.exposure, 0) + proposedExposure;
  if (totalExposure > policy.maxTotalExposure) {
    return `Total portfolio exposure (₹${totalExposure}) would exceed the maximum allowed (₹${policy.maxTotalExposure})`;
  }

  return null;
}

function checkCapital(
  policy: RiskPolicy,
  context: TradeRiskContext,
  proposedCapital: number,
  openPositions: readonly OpenPositionView[],
): string | null {
  if (proposedCapital > policy.maxCapitalPerTrade) {
    return `Capital required for this trade (₹${proposedCapital}) exceeds the maximum allowed per trade (₹${policy.maxCapitalPerTrade})`;
  }

  const instrumentCapital =
    openPositions
      .filter((p) => p.instrumentToken === context.instrumentToken)
      .reduce((sum, p) => sum + p.capitalUsed, 0) + proposedCapital;
  if (instrumentCapital > policy.maxCapitalPerInstrument) {
    return `Capital deployed on ${context.tradingSymbol} (₹${instrumentCapital}) would exceed the maximum allowed per instrument (₹${policy.maxCapitalPerInstrument})`;
  }

  const totalCapital =
    openPositions.reduce((sum, p) => sum + p.capitalUsed, 0) + proposedCapital;
  if (totalCapital > policy.maxTotalDeployedCapital) {
    return `Total deployed capital (₹${totalCapital}) would exceed the maximum allowed (₹${policy.maxTotalDeployedCapital})`;
  }

  const percentageUsed =
    policy.availableCapital > 0
      ? (totalCapital / policy.availableCapital) * 100
      : 100;
  if (percentageUsed > policy.maxPercentageOfAvailableCapital) {
    return `Deploying this trade would use ${percentageUsed.toFixed(2)}% of available capital, exceeding the configured maximum of ${policy.maxPercentageOfAvailableCapital}%`;
  }

  return null;
}

function checkDuplicatePosition(
  policy: RiskPolicy,
  context: TradeRiskContext,
  openPositions: readonly OpenPositionView[],
): string | null {
  const sameInstrument = openPositions.filter(
    (p) => p.instrumentToken === context.instrumentToken,
  );
  if (sameInstrument.length === 0) {
    return null;
  }

  switch (policy.duplicateInstrumentPolicy) {
    case DuplicateInstrumentPolicy.ALLOW_MULTIPLE:
      return null;
    case DuplicateInstrumentPolicy.REJECT:
      return `An open position already exists for ${context.tradingSymbol}`;
    case DuplicateInstrumentPolicy.ONE_POSITION_PER_INSTRUMENT:
      return `Only one open position is allowed per instrument, and ${context.tradingSymbol} already has one`;
    case DuplicateInstrumentPolicy.ALLOW_OPPOSITE_DIRECTION_ONLY: {
      const sameDirection = sameInstrument.some(
        (p) => p.direction === context.direction,
      );
      return sameDirection
        ? `An open position in the same direction already exists for ${context.tradingSymbol}`
        : null;
    }
  }
}
