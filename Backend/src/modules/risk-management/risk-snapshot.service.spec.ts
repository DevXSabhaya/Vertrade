import type { PositionManager } from '@modules/trade-lifecycle/position-manager.service';
import type { PnLService } from '@modules/trade-lifecycle/pnl.service';
import type { TradeRecord } from '@modules/trade-lifecycle/models/trade-record.model';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { RiskSnapshotService } from './risk-snapshot.service';
import type { DailyRiskStateService } from './daily-risk-state.service';
import type { CooldownService } from './cooldown.service';
import type { KillSwitchService } from './kill-switch.service';
import type { EmergencyStopService } from './emergency-stop.service';
import type { CircuitBreakerService } from './circuit-breaker.service';
import type { ExposureCapitalService } from './exposure-capital.service';
import type { RiskPolicyService } from './risk-policy.service';
import { KillSwitchStatus } from './models/kill-switch-status.enum';
import { DEFAULT_RISK_POLICY } from './models/risk-policy.model';
import { emptyDailyRiskState } from './models/daily-risk-state.model';
import { FakeClock } from './testing/fake-clock';

function record(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    tradeId: 't1',
    signalId: null,
    brokerOrderId: null,
    brokerPositionId: null,
    instrument: 'RELIANCE-EQ',
    exchange: 'NSE',
    token: '2885',
    direction: TradeDirection.LONG,
    entryPrice: 100,
    quantity: 10,
    filledQuantity: 10,
    openQuantity: 10,
    exitedQuantity: 0,
    averagePrice: 100,
    exitPrice: null,
    status: 'ACTIVE' as never,
    lifecycleStage: 'ACTIVE' as never,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targets: [110],
    currentTarget: null,
    stopLoss: 95,
    currentStopLoss: 95,
    trailingEnabled: false,
    trailingConfiguration: null,
    riskReward: null,
    realizedPnl: null,
    unrealizedPnl: null,
    charges: {
      brokerage: 0,
      stt: 0,
      exchangeCharges: 0,
      gst: 0,
      stampDuty: 0,
      sebiCharges: 0,
      total: 0,
    },
    netPnl: null,
    exitReason: null,
    brokerMetadata: {},
    positionDurationMs: 0,
    mode: 'PAPER',
    ...overrides,
  };
}

describe('RiskSnapshotService', () => {
  function build(options: {
    positions?: TradeRecord[];
    livePnl?: number | null;
  }) {
    const positionManager = {
      getActivePositions: jest.fn().mockResolvedValue(options.positions ?? []),
    } as unknown as PositionManager;
    const pnlService = {
      compute: jest.fn().mockReturnValue({ livePnl: options.livePnl ?? 0 }),
    } as unknown as PnLService;
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
      getOpenPositionViews: jest.fn().mockResolvedValue(
        (options.positions ?? []).map((p) => ({
          instrumentToken: p.token,
          direction: p.direction,
          quantity: p.openQuantity,
          exposure: (p.averagePrice ?? p.entryPrice) * p.openQuantity,
          capitalUsed: (p.averagePrice ?? p.entryPrice) * p.openQuantity,
        })),
      ),
    } as unknown as ExposureCapitalService;
    const riskPolicyService = {
      getPolicy: jest.fn().mockReturnValue(DEFAULT_RISK_POLICY),
    } as unknown as RiskPolicyService;

    const service = new RiskSnapshotService(
      positionManager,
      pnlService,
      dailyRiskStateService,
      cooldownService,
      killSwitchService,
      emergencyStopService,
      circuitBreakerService,
      exposureCapitalService,
      riskPolicyService,
      new FakeClock(),
    );
    return { service, exposureCapitalService };
  }

  it('composes an empty snapshot when there are no open positions', async () => {
    const { service } = build({ positions: [] });
    const snapshot = await service.compose();

    expect(snapshot.openTradeCount).toBe(0);
    expect(snapshot.totalExposure).toBe(0);
    expect(snapshot.usedCapital).toBe(0);
    expect(snapshot.dailyUnrealizedPnl).toBe(0);
    expect(snapshot.killSwitchStatus).toBe(KillSwitchStatus.ACTIVE);
    expect(snapshot.emergencyStopActive).toBe(false);
  });

  it('derives totalExposure/usedCapital from ExposureCapitalService.getOpenPositionViews, not a separate recomputation', async () => {
    const { service, exposureCapitalService } = build({
      positions: [record({ averagePrice: 100, openQuantity: 10 })],
    });

    const snapshot = await service.compose();

    expect(exposureCapitalService.getOpenPositionViews).toHaveBeenCalledTimes(
      1,
    );
    expect(snapshot.totalExposure).toBe(1_000);
    expect(snapshot.usedCapital).toBe(1_000);
  });

  it('sums dailyUnrealizedPnl across all open positions via PnLService', async () => {
    const { service } = build({
      positions: [record({ tradeId: 't1' }), record({ tradeId: 't2' })],
      livePnl: 250,
    });

    const snapshot = await service.compose();

    expect(snapshot.dailyUnrealizedPnl).toBe(500);
  });

  it('combines daily realized and unrealized PnL into totalPnl', async () => {
    const { service } = build({ positions: [record()], livePnl: 300 });
    const snapshot = await service.compose();
    expect(snapshot.totalPnl).toBe(
      snapshot.dailyRealizedPnl + snapshot.dailyUnrealizedPnl,
    );
  });

  it('computes currentRisk using direction-aware entry-to-stop distance', async () => {
    const { service } = build({
      positions: [
        record({
          direction: TradeDirection.LONG,
          entryPrice: 100,
          currentStopLoss: 95,
          openQuantity: 10,
        }),
      ],
    });
    const snapshot = await service.compose();
    expect(snapshot.currentRisk).toBe(50);
  });

  it('computes the same positive risk magnitude for a correctly-configured SHORT position', async () => {
    const { service } = build({
      positions: [
        record({
          direction: TradeDirection.SHORT,
          entryPrice: 100,
          currentStopLoss: 105,
          openQuantity: 10,
        }),
      ],
    });
    const snapshot = await service.compose();
    expect(snapshot.currentRisk).toBe(50);
  });
});
