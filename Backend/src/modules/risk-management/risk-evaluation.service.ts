import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { RiskPolicyService } from './risk-policy.service';
import { DailyRiskStateService } from './daily-risk-state.service';
import { CooldownService } from './cooldown.service';
import { KillSwitchService } from './kill-switch.service';
import { EmergencyStopService } from './emergency-stop.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ExposureCapitalService } from './exposure-capital.service';
import { RiskSnapshotService } from './risk-snapshot.service';
import { RiskEventPublisher } from './risk-event-publisher';
import { evaluateTradeRisk } from './domain/risk-evaluator';
import type { TradeRiskContext } from './models/trade-risk-context.model';
import type { RiskDecision } from './models/risk-decision.model';
import { RiskReasonCode } from './models/risk-reason-code.enum';

/**
 * The Risk Management Engine's single public entry point (Part 17 of the
 * spec): `RiskManagementRule` — the one and only caller — invokes
 * `evaluate()` from inside `TradeValidationService`'s existing pipeline.
 * Gathers everything `evaluateTradeRisk()` (the pure decision function)
 * needs from every stateful service in this module, calls it, then
 * publishes the resulting events — the decision logic itself never touches
 * an event bus, a clock, or a repository directly.
 */
@Injectable()
export class RiskEvaluationService {
  constructor(
    private readonly riskPolicyService: RiskPolicyService,
    private readonly dailyRiskStateService: DailyRiskStateService,
    private readonly cooldownService: CooldownService,
    private readonly killSwitchService: KillSwitchService,
    private readonly emergencyStopService: EmergencyStopService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly exposureCapitalService: ExposureCapitalService,
    private readonly riskSnapshotService: RiskSnapshotService,
    private readonly eventPublisher: RiskEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async evaluate(context: TradeRiskContext): Promise<RiskDecision> {
    this.eventPublisher.evaluationStarted(context.rawSymbol);

    const [openPositions, dailyRiskState, cooldown, riskSnapshot] =
      await Promise.all([
        this.exposureCapitalService.getOpenPositionViews(),
        this.dailyRiskStateService.getState(),
        this.cooldownService.getActiveCooldown(),
        this.riskSnapshotService.compose(),
      ]);

    const decision = evaluateTradeRisk({
      policy: this.riskPolicyService.getPolicy(),
      context,
      openPositions,
      dailyRiskState,
      cooldown,
      killSwitchStatus: this.killSwitchService.getState().status,
      emergencyStopActive: this.emergencyStopService.isActive(),
      circuitBreakers: this.circuitBreakerService.getAllSnapshots(),
      nowIso: this.clock.now().toISOString(),
      riskSnapshot,
    });

    this.eventPublisher.evaluationCompleted(context.rawSymbol, decision);

    if (decision.allowed) {
      this.eventPublisher.tradeApproved(context.rawSymbol, riskSnapshot);
    } else {
      this.eventPublisher.tradeRejected(
        context.rawSymbol,
        context.quantity,
        decision.reasonCode as RiskReasonCode,
        decision.message,
        riskSnapshot,
      );
      this.publishBreachEvent(decision, context);
    }

    return decision;
  }

  private publishBreachEvent(
    decision: RiskDecision,
    context: TradeRiskContext,
  ): void {
    switch (decision.reasonCode) {
      case RiskReasonCode.DAILY_LOSS_LIMIT_BREACHED: {
        const policy = this.riskPolicyService.getPolicy();
        this.eventPublisher.dailyLossLimitBreached(
          decision.riskSnapshot.dailyRealizedPnl,
          policy.maxDailyLoss,
        );
        return;
      }
      case RiskReasonCode.MAX_EXPOSURE_REACHED: {
        const policy = this.riskPolicyService.getPolicy();
        this.eventPublisher.exposureLimitBreached(
          context.rawSymbol,
          decision.riskSnapshot.totalExposure,
          policy.maxTotalExposure,
        );
        return;
      }
      case RiskReasonCode.MAX_OPEN_TRADES_REACHED: {
        const policy = this.riskPolicyService.getPolicy();
        this.eventPublisher.maxOpenTradesReached(
          decision.riskSnapshot.openTradeCount,
          policy.maxOpenTrades,
        );
        return;
      }
      default:
        return;
    }
  }
}
