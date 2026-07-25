import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import {
  DEFAULT_RISK_POLICY,
  DailyLossBreachAction,
  DailyLossLimitType,
  DuplicateInstrumentPolicy,
  type RiskPolicy,
} from '../models/risk-policy.model';
import { RiskReasonCode } from '../models/risk-reason-code.enum';
import { KillSwitchStatus } from '../models/kill-switch-status.enum';
import {
  CircuitBreakerName,
  CircuitBreakerStatus,
} from '../models/circuit-breaker.model';
import type { CooldownState } from '../models/cooldown.model';
import { CooldownReason } from '../models/cooldown.model';
import type { DailyRiskState } from '../models/daily-risk-state.model';
import type { RiskSnapshot } from '../models/risk-snapshot.model';
import type { TradeRiskContext } from '../models/trade-risk-context.model';
import {
  evaluateTradeRisk,
  type OpenPositionView,
  type RiskEvaluationInput,
} from './risk-evaluator';

const NOW_ISO = '2026-07-21T09:15:00.000Z';

function buildContext(
  overrides: Partial<TradeRiskContext> = {},
): TradeRiskContext {
  return {
    rawSymbol: 'RELIANCE',
    instrumentToken: '2885',
    tradingSymbol: 'RELIANCE-EQ',
    direction: TradeDirection.LONG,
    quantity: 10,
    entryTriggerPrice: 100,
    initialStopLoss: 95,
    targets: [110],
    ...overrides,
  };
}

function buildSnapshot(overrides: Partial<RiskSnapshot> = {}): RiskSnapshot {
  return {
    asOf: NOW_ISO,
    dailyRealizedPnl: 0,
    dailyUnrealizedPnl: 0,
    totalPnl: 0,
    openTradeCount: 0,
    openPositionCount: 0,
    totalExposure: 0,
    availableCapital: DEFAULT_RISK_POLICY.availableCapital,
    usedCapital: 0,
    currentRisk: 0,
    consecutiveLosses: 0,
    cooldown: null,
    killSwitchStatus: KillSwitchStatus.ACTIVE,
    emergencyStopActive: false,
    circuitBreakers: [],
    ...overrides,
  };
}

function buildDailyRiskState(
  overrides: Partial<DailyRiskState> = {},
): DailyRiskState {
  return {
    tradeDate: '2026-07-21',
    realizedPnl: 0,
    tradeCount: 0,
    consecutiveLosses: 0,
    lastTradeWasLoss: null,
    updatedAt: NOW_ISO,
    ...overrides,
  };
}

function buildInput(
  overrides: Partial<RiskEvaluationInput> = {},
  policyOverrides: Partial<RiskPolicy> = {},
): RiskEvaluationInput {
  const policy: RiskPolicy = { ...DEFAULT_RISK_POLICY, ...policyOverrides };
  return {
    policy,
    context: buildContext(),
    openPositions: [],
    dailyRiskState: buildDailyRiskState(),
    cooldown: null,
    killSwitchStatus: KillSwitchStatus.ACTIVE,
    emergencyStopActive: false,
    circuitBreakers: [],
    nowIso: NOW_ISO,
    riskSnapshot: buildSnapshot(),
    ...overrides,
  };
}

function openPosition(
  overrides: Partial<OpenPositionView> = {},
): OpenPositionView {
  return {
    instrumentToken: '2885',
    direction: TradeDirection.LONG,
    quantity: 10,
    exposure: 1_000,
    capitalUsed: 1_000,
    ...overrides,
  };
}

describe('evaluateTradeRisk', () => {
  it('approves a trade that violates no policy limits', () => {
    const decision = evaluateTradeRisk(buildInput());
    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBeNull();
  });

  it('rejects when emergency stop is active, ahead of every other check', () => {
    const decision = evaluateTradeRisk(
      buildInput({
        emergencyStopActive: true,
        killSwitchStatus: KillSwitchStatus.EMERGENCY_STOP,
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(RiskReasonCode.EMERGENCY_STOP_ACTIVE);
  });

  it('rejects when the kill switch is not ACTIVE', () => {
    const decision = evaluateTradeRisk(
      buildInput({ killSwitchStatus: KillSwitchStatus.TRADING_DISABLED }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(RiskReasonCode.KILL_SWITCH_ACTIVE);
  });

  it('rejects when the broker circuit breaker is open', () => {
    const decision = evaluateTradeRisk(
      buildInput({
        circuitBreakers: [
          {
            name: CircuitBreakerName.BROKER,
            status: CircuitBreakerStatus.OPEN,
            consecutiveFailures: 3,
            openedAt: NOW_ISO,
            lastFailureAt: NOW_ISO,
            lastSuccessAt: null,
          },
        ],
      }),
    );
    expect(decision.reasonCode).toBe(RiskReasonCode.BROKER_UNAVAILABLE);
  });

  it('rejects when the market data circuit breaker is open', () => {
    const decision = evaluateTradeRisk(
      buildInput({
        circuitBreakers: [
          {
            name: CircuitBreakerName.MARKET_DATA,
            status: CircuitBreakerStatus.HALF_OPEN,
            consecutiveFailures: 3,
            openedAt: NOW_ISO,
            lastFailureAt: NOW_ISO,
            lastSuccessAt: null,
          },
        ],
      }),
    );
    expect(decision.reasonCode).toBe(RiskReasonCode.MARKET_DATA_UNAVAILABLE);
  });

  it('rejects when the order execution circuit breaker is open', () => {
    const decision = evaluateTradeRisk(
      buildInput({
        circuitBreakers: [
          {
            name: CircuitBreakerName.ORDER_EXECUTION,
            status: CircuitBreakerStatus.OPEN,
            consecutiveFailures: 3,
            openedAt: NOW_ISO,
            lastFailureAt: NOW_ISO,
            lastSuccessAt: null,
          },
        ],
      }),
    );
    expect(decision.reasonCode).toBe(RiskReasonCode.CIRCUIT_BREAKER_OPEN);
  });

  it('rejects when a cooldown is active', () => {
    const cooldown: CooldownState = {
      reason: CooldownReason.STOP_LOSS_HIT,
      startedAt: NOW_ISO,
      expiresAt: '2026-07-21T10:00:00.000Z',
    };
    const decision = evaluateTradeRisk(buildInput({ cooldown }));
    expect(decision.reasonCode).toBe(RiskReasonCode.COOLDOWN_ACTIVE);
  });

  it('rejects when consecutive losses reach the configured maximum', () => {
    const decision = evaluateTradeRisk(
      buildInput(
        { dailyRiskState: buildDailyRiskState({ consecutiveLosses: 3 }) },
        { maxConsecutiveLosses: 3 },
      ),
    );
    expect(decision.reasonCode).toBe(
      RiskReasonCode.MAX_CONSECUTIVE_LOSSES_REACHED,
    );
  });

  it('rejects when the absolute daily loss limit is breached', () => {
    const decision = evaluateTradeRisk(
      buildInput(
        { dailyRiskState: buildDailyRiskState({ realizedPnl: -5_000 }) },
        { maxDailyLoss: 5_000, maxDailyLossType: DailyLossLimitType.ABSOLUTE },
      ),
    );
    expect(decision.reasonCode).toBe(RiskReasonCode.DAILY_LOSS_LIMIT_BREACHED);
  });

  it('rejects when the percentage-based daily loss limit is breached', () => {
    const decision = evaluateTradeRisk(
      buildInput(
        { dailyRiskState: buildDailyRiskState({ realizedPnl: -6_000 }) },
        {
          maxDailyLoss: 5,
          maxDailyLossType: DailyLossLimitType.PERCENTAGE,
          dailyRiskCapital: 100_000,
        },
      ),
    );
    expect(decision.reasonCode).toBe(RiskReasonCode.DAILY_LOSS_LIMIT_BREACHED);
  });

  it('allows trading when the daily loss is under the limit', () => {
    const decision = evaluateTradeRisk(
      buildInput(
        { dailyRiskState: buildDailyRiskState({ realizedPnl: -1_000 }) },
        { maxDailyLoss: 5_000 },
      ),
    );
    expect(decision.allowed).toBe(true);
  });

  it('rejects when the daily loss breach action is CLOSE_ALL_POSITIONS but breach is still detected the same way', () => {
    const decision = evaluateTradeRisk(
      buildInput(
        { dailyRiskState: buildDailyRiskState({ realizedPnl: -5_000 }) },
        {
          maxDailyLoss: 5_000,
          dailyLossBreachAction: DailyLossBreachAction.CLOSE_ALL_POSITIONS,
        },
      ),
    );
    expect(decision.reasonCode).toBe(RiskReasonCode.DAILY_LOSS_LIMIT_BREACHED);
  });

  it('rejects when the maximum number of open trades is reached', () => {
    const decision = evaluateTradeRisk(
      buildInput(
        { openPositions: [openPosition(), openPosition(), openPosition()] },
        { maxOpenTrades: 3 },
      ),
    );
    expect(decision.reasonCode).toBe(RiskReasonCode.MAX_OPEN_TRADES_REACHED);
  });

  it('allows trading below the maximum open trades limit', () => {
    const decision = evaluateTradeRisk(
      buildInput(
        { openPositions: [openPosition(), openPosition()] },
        { maxOpenTrades: 3 },
      ),
    );
    expect(decision.allowed).toBe(true);
  });

  describe('quantity limits', () => {
    it('rejects when the requested quantity exceeds the per-trade maximum', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          { context: buildContext({ quantity: 100 }) },
          { maxQuantityPerTrade: 50 },
        ),
      );
      expect(decision.reasonCode).toBe(RiskReasonCode.MAX_QUANTITY_EXCEEDED);
    });

    it('rejects when total instrument quantity would exceed the per-instrument maximum', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          {
            context: buildContext({ quantity: 10, instrumentToken: '2885' }),
            openPositions: [
              openPosition({ instrumentToken: '2885', quantity: 45 }),
            ],
          },
          { maxQuantityPerTrade: 1_000, maxQuantityPerInstrument: 50 },
        ),
      );
      expect(decision.reasonCode).toBe(RiskReasonCode.MAX_QUANTITY_EXCEEDED);
    });

    it('rejects when the global open quantity would be exceeded', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          {
            context: buildContext({ quantity: 10, instrumentToken: '9999' }),
            openPositions: [
              openPosition({ instrumentToken: '2885', quantity: 45 }),
            ],
          },
          {
            maxQuantityPerTrade: 1_000,
            maxQuantityPerInstrument: 1_000,
            maxQuantityGlobal: 50,
          },
        ),
      );
      expect(decision.reasonCode).toBe(RiskReasonCode.MAX_QUANTITY_EXCEEDED);
    });
  });

  describe('exposure limits', () => {
    it('rejects when trade exposure exceeds the per-trade maximum', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          {
            context: buildContext({ entryTriggerPrice: 100, quantity: 1_000 }),
          },
          { maxExposurePerTrade: 50_000 },
        ),
      );
      expect(decision.reasonCode).toBe(RiskReasonCode.MAX_EXPOSURE_REACHED);
    });

    it('rejects when total per-instrument exposure would be exceeded', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          {
            context: buildContext({
              entryTriggerPrice: 100,
              quantity: 10,
              instrumentToken: '2885',
            }),
            openPositions: [
              openPosition({ instrumentToken: '2885', exposure: 49_500 }),
            ],
          },
          { maxExposurePerTrade: 1_000_000, maxExposurePerInstrument: 50_000 },
        ),
      );
      expect(decision.reasonCode).toBe(RiskReasonCode.MAX_EXPOSURE_REACHED);
    });

    it('rejects when total portfolio exposure would be exceeded', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          {
            context: buildContext({
              entryTriggerPrice: 100,
              quantity: 10,
              instrumentToken: '9999',
            }),
            openPositions: [
              openPosition({ instrumentToken: '2885', exposure: 99_500 }),
            ],
          },
          {
            maxExposurePerTrade: 1_000_000,
            maxExposurePerInstrument: 1_000_000,
            maxTotalExposure: 100_000,
          },
        ),
      );
      expect(decision.reasonCode).toBe(RiskReasonCode.MAX_EXPOSURE_REACHED);
    });
  });

  describe('capital limits', () => {
    it('rejects when required capital exceeds the per-trade maximum', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          {
            context: buildContext({ entryTriggerPrice: 100, quantity: 1_000 }),
          },
          { maxExposurePerTrade: 1_000_000, maxCapitalPerTrade: 50_000 },
        ),
      );
      expect(decision.reasonCode).toBe(RiskReasonCode.MAX_CAPITAL_EXCEEDED);
    });

    it('rejects when total deployed capital would exceed the maximum', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          {
            context: buildContext({
              entryTriggerPrice: 100,
              quantity: 10,
              instrumentToken: '9999',
            }),
            openPositions: [
              openPosition({ instrumentToken: '2885', capitalUsed: 99_500 }),
            ],
          },
          {
            maxExposurePerTrade: 1_000_000,
            maxExposurePerInstrument: 1_000_000,
            maxTotalExposure: 1_000_000,
            maxCapitalPerTrade: 1_000_000,
            maxCapitalPerInstrument: 1_000_000,
            maxTotalDeployedCapital: 100_000,
          },
        ),
      );
      expect(decision.reasonCode).toBe(RiskReasonCode.MAX_CAPITAL_EXCEEDED);
    });

    it('rejects when the percentage of available capital would be exceeded', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          { context: buildContext({ entryTriggerPrice: 100, quantity: 900 }) },
          {
            maxExposurePerTrade: 1_000_000,
            maxExposurePerInstrument: 1_000_000,
            maxTotalExposure: 1_000_000,
            maxCapitalPerTrade: 1_000_000,
            maxCapitalPerInstrument: 1_000_000,
            maxTotalDeployedCapital: 1_000_000,
            availableCapital: 100_000,
            maxPercentageOfAvailableCapital: 50,
          },
        ),
      );
      expect(decision.reasonCode).toBe(RiskReasonCode.MAX_CAPITAL_EXCEEDED);
    });
  });

  describe('risk per trade limits', () => {
    it('rejects when the rupee risk exceeds the configured maximum', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          {
            context: buildContext({
              entryTriggerPrice: 100,
              initialStopLoss: 90,
              quantity: 100,
            }),
          },
          { maxRiskPerTrade: 500, maxRiskPerTradePercentage: 100 },
        ),
      );
      expect(decision.reasonCode).toBe(
        RiskReasonCode.MAX_RISK_PER_TRADE_EXCEEDED,
      );
    });

    it('rejects when the risk percentage exceeds the configured maximum', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          {
            context: buildContext({
              entryTriggerPrice: 100,
              initialStopLoss: 95,
              quantity: 100,
            }),
          },
          {
            maxRiskPerTrade: 1_000_000,
            maxRiskPerTradePercentage: 0.1,
            dailyRiskCapital: 100_000,
          },
        ),
      );
      expect(decision.reasonCode).toBe(
        RiskReasonCode.MAX_RISK_PER_TRADE_EXCEEDED,
      );
    });

    it('allows a trade whose risk is within both the rupee and percentage limits', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          {
            context: buildContext({
              entryTriggerPrice: 100,
              initialStopLoss: 99,
              quantity: 10,
            }),
          },
          {
            maxRiskPerTrade: 1_000,
            maxRiskPerTradePercentage: 5,
            dailyRiskCapital: 100_000,
          },
        ),
      );
      expect(decision.allowed).toBe(true);
    });
  });

  describe('duplicate position policy', () => {
    it('allows multiple positions on the same instrument under ALLOW_MULTIPLE', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          { openPositions: [openPosition({ instrumentToken: '2885' })] },
          {
            duplicateInstrumentPolicy: DuplicateInstrumentPolicy.ALLOW_MULTIPLE,
          },
        ),
      );
      expect(decision.allowed).toBe(true);
    });

    it('rejects any duplicate instrument under REJECT', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          { openPositions: [openPosition({ instrumentToken: '2885' })] },
          { duplicateInstrumentPolicy: DuplicateInstrumentPolicy.REJECT },
        ),
      );
      expect(decision.reasonCode).toBe(RiskReasonCode.DUPLICATE_POSITION);
    });

    it('rejects any duplicate instrument under ONE_POSITION_PER_INSTRUMENT', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          { openPositions: [openPosition({ instrumentToken: '2885' })] },
          {
            duplicateInstrumentPolicy:
              DuplicateInstrumentPolicy.ONE_POSITION_PER_INSTRUMENT,
          },
        ),
      );
      expect(decision.reasonCode).toBe(RiskReasonCode.DUPLICATE_POSITION);
    });

    it('under ALLOW_OPPOSITE_DIRECTION_ONLY, rejects a same-direction duplicate', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          {
            context: buildContext({
              direction: TradeDirection.LONG,
              instrumentToken: '2885',
            }),
            openPositions: [
              openPosition({
                instrumentToken: '2885',
                direction: TradeDirection.LONG,
              }),
            ],
          },
          {
            duplicateInstrumentPolicy:
              DuplicateInstrumentPolicy.ALLOW_OPPOSITE_DIRECTION_ONLY,
          },
        ),
      );
      expect(decision.reasonCode).toBe(RiskReasonCode.DUPLICATE_POSITION);
    });

    it('under ALLOW_OPPOSITE_DIRECTION_ONLY, allows an opposite-direction duplicate', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          {
            context: buildContext({
              direction: TradeDirection.LONG,
              instrumentToken: '2885',
            }),
            openPositions: [
              openPosition({
                instrumentToken: '2885',
                direction: TradeDirection.SHORT,
              }),
            ],
          },
          {
            duplicateInstrumentPolicy:
              DuplicateInstrumentPolicy.ALLOW_OPPOSITE_DIRECTION_ONLY,
          },
        ),
      );
      expect(decision.allowed).toBe(true);
    });

    it('allows a position on a different instrument regardless of policy', () => {
      const decision = evaluateTradeRisk(
        buildInput(
          {
            context: buildContext({ instrumentToken: '2885' }),
            openPositions: [openPosition({ instrumentToken: '3456' })],
          },
          { duplicateInstrumentPolicy: DuplicateInstrumentPolicy.REJECT },
        ),
      );
      expect(decision.allowed).toBe(true);
    });
  });

  it('always returns the risk snapshot and evaluation timestamp unchanged', () => {
    const snapshot = buildSnapshot({ totalPnl: 42 });
    const decision = evaluateTradeRisk(
      buildInput({ riskSnapshot: snapshot, nowIso: NOW_ISO }),
    );
    expect(decision.riskSnapshot).toBe(snapshot);
    expect(decision.evaluatedAt).toBe(NOW_ISO);
  });
});
