import { RiskEvaluationService } from './risk-evaluation.service';
import type { RiskPolicyService } from './risk-policy.service';
import type { DailyRiskStateService } from './daily-risk-state.service';
import type { CooldownService } from './cooldown.service';
import type { KillSwitchService } from './kill-switch.service';
import type { EmergencyStopService } from './emergency-stop.service';
import type { CircuitBreakerService } from './circuit-breaker.service';
import type { ExposureCapitalService } from './exposure-capital.service';
import type { RiskSnapshotService } from './risk-snapshot.service';
import type { RiskEventPublisher } from './risk-event-publisher';
import { DEFAULT_RISK_POLICY } from './models/risk-policy.model';
import { emptyDailyRiskState } from './models/daily-risk-state.model';
import { KillSwitchStatus } from './models/kill-switch-status.enum';
import { RiskReasonCode } from './models/risk-reason-code.enum';
import type { TradeRiskContext } from './models/trade-risk-context.model';
import type { RiskSnapshot } from './models/risk-snapshot.model';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { FakeClock } from './testing/fake-clock';

function context(overrides: Partial<TradeRiskContext> = {}): TradeRiskContext {
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

function snapshot(overrides: Partial<RiskSnapshot> = {}): RiskSnapshot {
  return {
    asOf: new Date().toISOString(),
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

function build(policyOverrides: Partial<typeof DEFAULT_RISK_POLICY> = {}) {
  const composedSnapshot = snapshot();
  const riskPolicyService = {
    getPolicy: jest
      .fn()
      .mockReturnValue({ ...DEFAULT_RISK_POLICY, ...policyOverrides }),
  } as unknown as RiskPolicyService;
  const dailyRiskStateService = {
    getState: jest
      .fn()
      .mockResolvedValue(
        emptyDailyRiskState('2026-07-21', new Date().toISOString()),
      ),
  } as unknown as DailyRiskStateService;
  const cooldownService = {
    getActiveCooldown: jest.fn().mockResolvedValue(null),
  } as unknown as CooldownService;
  const killSwitchService = {
    getState: jest.fn().mockReturnValue({ status: KillSwitchStatus.ACTIVE }),
  } as unknown as KillSwitchService;
  const emergencyStopService = {
    isActive: jest.fn().mockReturnValue(false),
  } as unknown as EmergencyStopService;
  const circuitBreakerService = {
    getAllSnapshots: jest.fn().mockReturnValue([]),
  } as unknown as CircuitBreakerService;
  const exposureCapitalService = {
    getOpenPositionViews: jest.fn().mockResolvedValue([]),
  } as unknown as ExposureCapitalService;
  const riskSnapshotService = {
    compose: jest.fn().mockResolvedValue(composedSnapshot),
  } as unknown as RiskSnapshotService;
  const eventPublisher: jest.Mocked<RiskEventPublisher> = {
    evaluationStarted: jest.fn(),
    evaluationCompleted: jest.fn(),
    tradeApproved: jest.fn(),
    tradeRejected: jest.fn(),
    dailyLossLimitBreached: jest.fn(),
    exposureLimitBreached: jest.fn(),
    maxOpenTradesReached: jest.fn(),
    cooldownStarted: jest.fn(),
    cooldownEnded: jest.fn(),
    consecutiveLossLimitBreached: jest.fn(),
    killSwitchActivated: jest.fn(),
    killSwitchDeactivated: jest.fn(),
    emergencyStopActivated: jest.fn(),
    emergencyStopReset: jest.fn(),
    circuitBreakerOpened: jest.fn(),
    circuitBreakerHalfOpened: jest.fn(),
    circuitBreakerClosed: jest.fn(),
  } as unknown as jest.Mocked<RiskEventPublisher>;

  const service = new RiskEvaluationService(
    riskPolicyService,
    dailyRiskStateService,
    cooldownService,
    killSwitchService,
    emergencyStopService,
    circuitBreakerService,
    exposureCapitalService,
    riskSnapshotService,
    eventPublisher,
    new FakeClock(),
  );

  return {
    service,
    eventPublisher,
    composedSnapshot,
    killSwitchService,
    emergencyStopService,
  };
}

describe('RiskEvaluationService', () => {
  it('approves a trade within all limits and publishes started/completed/approved events', async () => {
    const { service, eventPublisher } = build();

    const decision = await service.evaluate(context());

    expect(decision.allowed).toBe(true);
    expect(eventPublisher.evaluationStarted).toHaveBeenCalledWith('RELIANCE');
    expect(eventPublisher.evaluationCompleted).toHaveBeenCalledWith(
      'RELIANCE',
      decision,
    );
    expect(eventPublisher.tradeApproved).toHaveBeenCalledTimes(1);
    expect(eventPublisher.tradeRejected).not.toHaveBeenCalled();
  });

  it('rejects a trade when the kill switch is blocking and publishes tradeRejected with requestedQuantity', async () => {
    const { service, eventPublisher, killSwitchService } = build();
    (killSwitchService.getState as jest.Mock).mockReturnValue({
      status: KillSwitchStatus.TRADING_DISABLED,
    });

    const decision = await service.evaluate(context({ quantity: 25 }));

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(RiskReasonCode.KILL_SWITCH_ACTIVE);
    expect(eventPublisher.tradeRejected).toHaveBeenCalledWith(
      'RELIANCE',
      25,
      RiskReasonCode.KILL_SWITCH_ACTIVE,
      expect.any(String),
      expect.any(Object),
    );
    expect(eventPublisher.tradeApproved).not.toHaveBeenCalled();
  });

  it('rejects when emergency stop is active', async () => {
    const { service, emergencyStopService } = build();
    (emergencyStopService.isActive as jest.Mock).mockReturnValue(true);

    const decision = await service.evaluate(context());

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(RiskReasonCode.EMERGENCY_STOP_ACTIVE);
  });

  it('publishes DailyLossLimitBreached when that specific reason code is returned', async () => {
    const { eventPublisher } = build({ maxDailyLoss: 1_000 });
    const dailyRiskStateService = {
      getState: jest.fn().mockResolvedValue({
        ...emptyDailyRiskState('2026-07-21', new Date().toISOString()),
        realizedPnl: -1_500,
      }),
    } as unknown as DailyRiskStateService;
    // Rebuild with a breached daily state via a fresh service instance.
    const rebuilt = new RiskEvaluationService(
      {
        getPolicy: () => ({ ...DEFAULT_RISK_POLICY, maxDailyLoss: 1_000 }),
      } as unknown as RiskPolicyService,
      dailyRiskStateService,
      {
        getActiveCooldown: jest.fn().mockResolvedValue(null),
      } as unknown as CooldownService,
      {
        getState: jest
          .fn()
          .mockReturnValue({ status: KillSwitchStatus.ACTIVE }),
      } as unknown as KillSwitchService,
      {
        isActive: jest.fn().mockReturnValue(false),
      } as unknown as EmergencyStopService,
      {
        getAllSnapshots: jest.fn().mockReturnValue([]),
      } as unknown as CircuitBreakerService,
      {
        getOpenPositionViews: jest.fn().mockResolvedValue([]),
      } as unknown as ExposureCapitalService,
      {
        compose: jest
          .fn()
          .mockResolvedValue(snapshot({ dailyRealizedPnl: -1_500 })),
      } as unknown as RiskSnapshotService,
      eventPublisher,
      new FakeClock(),
    );

    const decision = await rebuilt.evaluate(context());

    expect(decision.reasonCode).toBe(RiskReasonCode.DAILY_LOSS_LIMIT_BREACHED);
    expect(eventPublisher.dailyLossLimitBreached).toHaveBeenCalledWith(
      -1_500,
      1_000,
    );
  });

  it('gathers open positions, daily state, cooldown, and snapshot in parallel before evaluating', async () => {
    const { service, composedSnapshot } = build();

    const decision = await service.evaluate(context());

    expect(decision.riskSnapshot).toBe(composedSnapshot);
  });
});
