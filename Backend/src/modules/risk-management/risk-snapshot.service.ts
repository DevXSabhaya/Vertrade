import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { PositionManager } from '@modules/trade-lifecycle/position-manager.service';
import { PnLService } from '@modules/trade-lifecycle/pnl.service';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { DailyRiskStateService } from './daily-risk-state.service';
import { CooldownService } from './cooldown.service';
import { KillSwitchService } from './kill-switch.service';
import { EmergencyStopService } from './emergency-stop.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ExposureCapitalService } from './exposure-capital.service';
import { RiskPolicyService } from './risk-policy.service';
import type { RiskSnapshot } from './models/risk-snapshot.model';

/**
 * Composes the full portfolio-level `RiskSnapshot` (Part 15) from every
 * other service in this module plus Phase 10's `PositionManager`/
 * `PnLService` — the single place that assembly happens, so `RiskDecision`,
 * `GET /risk/snapshot`, and `GET /risk/status` all see an identical figure
 * rather than three slightly-different recomputations.
 */
@Injectable()
export class RiskSnapshotService {
  constructor(
    private readonly positionManager: PositionManager,
    private readonly pnlService: PnLService,
    private readonly dailyRiskStateService: DailyRiskStateService,
    private readonly cooldownService: CooldownService,
    private readonly killSwitchService: KillSwitchService,
    private readonly emergencyStopService: EmergencyStopService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly exposureCapitalService: ExposureCapitalService,
    private readonly riskPolicyService: RiskPolicyService,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async compose(): Promise<RiskSnapshot> {
    const [openPositions, dailyState, cooldown, openPositionViews] =
      await Promise.all([
        this.positionManager.getActivePositions(),
        this.dailyRiskStateService.getState(),
        this.cooldownService.getActiveCooldown(),
        this.exposureCapitalService.getOpenPositionViews(),
      ]);

    const dailyUnrealizedPnl = openPositions.reduce((sum, record) => {
      const pnl = this.pnlService.compute({
        id: record.tradeId,
        direction: record.direction,
        state: record.status,
        exchange: record.exchange,
        tradingSymbol: record.instrument,
        instrumentToken: record.token,
        quantity: record.quantity,
        entryTriggerPrice: record.entryPrice,
        initialStopLoss: record.stopLoss,
        currentStopLoss: record.currentStopLoss,
        targets: record.targets,
        mode: record.mode,
        brokerAccountId: null,
        remainingTargets: [],
        entryOrderId: record.brokerOrderId,
        entryOrderLifecycle: null,
        entryFillPrice: record.averagePrice,
        filledQuantity: record.filledQuantity,
        exitOrderId: null,
        exitOrderLifecycle: null,
        exitedQuantity: record.exitedQuantity,
        exitProceeds: 0,
        openQuantity: record.openQuantity,
        exitPrice: record.exitPrice,
        realizedPnl: record.realizedPnl,
        isAwaitingExit: false,
        metadata: {},
        history: [],
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
      return sum + (pnl.livePnl ?? 0);
    }, 0);

    const totalExposure = openPositionViews.reduce(
      (sum, v) => sum + v.exposure,
      0,
    );
    const usedCapital = openPositionViews.reduce(
      (sum, v) => sum + v.capitalUsed,
      0,
    );
    const policy = this.riskPolicyService.getPolicy();

    return {
      asOf: this.clock.now().toISOString(),
      dailyRealizedPnl: dailyState.realizedPnl,
      dailyUnrealizedPnl,
      totalPnl: dailyState.realizedPnl + dailyUnrealizedPnl,
      openTradeCount: openPositions.length,
      openPositionCount: openPositions.length,
      totalExposure,
      availableCapital: policy.availableCapital,
      usedCapital,
      currentRisk: openPositions.reduce((sum, r) => {
        const directionSign = r.direction === TradeDirection.LONG ? 1 : -1;
        return (
          sum +
          directionSign * (r.entryPrice - r.currentStopLoss) * r.openQuantity
        );
      }, 0),
      consecutiveLosses: dailyState.consecutiveLosses,
      cooldown,
      killSwitchStatus: this.killSwitchService.getState().status,
      emergencyStopActive: this.emergencyStopService.isActive(),
      circuitBreakers: this.circuitBreakerService.getAllSnapshots(),
    };
  }
}
