/** Absolute rupee amount, or a percentage of `dailyRiskCapital`. */
export enum DailyLossLimitType {
  ABSOLUTE = 'ABSOLUTE',
  PERCENTAGE = 'PERCENTAGE',
}

/** Part 7 of the spec — how repeated positions on the same instrument/direction are handled. */
export enum DuplicateInstrumentPolicy {
  ALLOW_MULTIPLE = 'ALLOW_MULTIPLE',
  REJECT = 'REJECT',
  ALLOW_OPPOSITE_DIRECTION_ONLY = 'ALLOW_OPPOSITE_DIRECTION_ONLY',
  ONE_POSITION_PER_INSTRUMENT = 'ONE_POSITION_PER_INSTRUMENT',
}

/** What happens to already-open positions once the daily loss limit is breached. */
export enum DailyLossBreachAction {
  BLOCK_NEW_TRADES_ONLY = 'BLOCK_NEW_TRADES_ONLY',
  CLOSE_ALL_POSITIONS = 'CLOSE_ALL_POSITIONS',
}

/**
 * The complete, runtime-configurable Risk Policy (Phase 11 spec, Part 13).
 * Nothing here is hardcoded into the evaluation logic — every limit below is
 * read from whatever policy `RiskPolicyService` currently holds, sourced
 * from Mongo and mutable via `PUT /risk/policy`.
 */
export interface RiskPolicy {
  // Daily loss limit (Part 1)
  readonly maxDailyLoss: number;
  readonly maxDailyLossType: DailyLossLimitType;
  readonly dailyRiskCapital: number;
  readonly dailyLossBreachAction: DailyLossBreachAction;

  // Open trades (Part 2)
  readonly maxOpenTrades: number;

  // Quantity (Part 3)
  readonly maxQuantityPerTrade: number;
  readonly maxQuantityPerInstrument: number;
  readonly maxQuantityGlobal: number;

  // Exposure (Part 4)
  readonly maxExposurePerTrade: number;
  readonly maxExposurePerInstrument: number;
  readonly maxTotalExposure: number;

  // Capital allocation (Part 5)
  readonly maxCapitalPerTrade: number;
  readonly maxCapitalPerInstrument: number;
  readonly maxTotalDeployedCapital: number;
  readonly maxPercentageOfAvailableCapital: number;
  readonly availableCapital: number;

  // Risk per trade (Part 6)
  readonly maxRiskPerTrade: number;
  readonly maxRiskPerTradePercentage: number;

  // Duplicate/concurrent positions (Part 7)
  readonly duplicateInstrumentPolicy: DuplicateInstrumentPolicy;

  // Cooldown (Part 8)
  readonly cooldownAfterLossMs: number;
  readonly cooldownAfterDailyLossMs: number;
  readonly cooldownAfterConsecutiveLossesMs: number;
  readonly cooldownAfterEmergencyExitMs: number;

  // Consecutive loss protection (Part 9)
  readonly maxConsecutiveLosses: number;

  // Kill switch (Part 10)
  readonly killSwitchEnabled: boolean;
  /** Whether activating EMERGENCY_STOP via the kill switch force-exits open positions, or only blocks new entries. */
  readonly killSwitchForceExitsPositions: boolean;

  // Circuit breaker (Part 12)
  readonly circuitBreakerFailureThreshold: number;
  readonly circuitBreakerOpenDurationMs: number;

  readonly updatedAt: string;
}

export const DEFAULT_RISK_POLICY: RiskPolicy = {
  maxDailyLoss: 5_000,
  maxDailyLossType: DailyLossLimitType.ABSOLUTE,
  dailyRiskCapital: 100_000,
  dailyLossBreachAction: DailyLossBreachAction.BLOCK_NEW_TRADES_ONLY,

  maxOpenTrades: 3,

  maxQuantityPerTrade: 1_000,
  maxQuantityPerInstrument: 2_000,
  maxQuantityGlobal: 5_000,

  maxExposurePerTrade: 100_000,
  maxExposurePerInstrument: 200_000,
  maxTotalExposure: 500_000,

  maxCapitalPerTrade: 100_000,
  maxCapitalPerInstrument: 200_000,
  maxTotalDeployedCapital: 500_000,
  maxPercentageOfAvailableCapital: 80,
  availableCapital: 500_000,

  maxRiskPerTrade: 1_000,
  maxRiskPerTradePercentage: 2,

  duplicateInstrumentPolicy: DuplicateInstrumentPolicy.ALLOW_MULTIPLE,

  cooldownAfterLossMs: 0,
  cooldownAfterDailyLossMs: 30 * 60 * 1000,
  cooldownAfterConsecutiveLossesMs: 30 * 60 * 1000,
  cooldownAfterEmergencyExitMs: 60 * 60 * 1000,

  maxConsecutiveLosses: 3,

  killSwitchEnabled: true,
  killSwitchForceExitsPositions: false,

  circuitBreakerFailureThreshold: 3,
  circuitBreakerOpenDurationMs: 60_000,

  updatedAt: new Date(0).toISOString(),
};
