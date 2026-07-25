import type { FeatureFlagsService } from '@core/feature-flags/feature-flag.service';
import type { RiskEvaluationService } from '@modules/risk-management/risk-evaluation.service';
import { RiskReasonCode } from '@modules/risk-management/models/risk-reason-code.enum';
import { KillSwitchStatus } from '@modules/risk-management/models/kill-switch-status.enum';
import type { RiskDecision } from '@modules/risk-management/models/risk-decision.model';
import type { RiskSnapshot } from '@modules/risk-management/models/risk-snapshot.model';
import { RiskManagementRule } from './risk-management.rule';
import { ValidationContext } from '../models/validation-context';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { FakeClock } from '../testing/fake-clock';
import {
  buildValidationRequest,
  buildResolvedInstrument,
} from '../testing/build-request';

function featureFlagsService(disabled: boolean): FeatureFlagsService {
  return {
    isEnabled: jest.fn().mockResolvedValue(disabled),
  } as unknown as FeatureFlagsService;
}

function riskSnapshot(): RiskSnapshot {
  return {
    asOf: new Date().toISOString(),
    dailyRealizedPnl: 0,
    dailyUnrealizedPnl: 0,
    totalPnl: 0,
    openTradeCount: 0,
    openPositionCount: 0,
    totalExposure: 0,
    availableCapital: 0,
    usedCapital: 0,
    currentRisk: 0,
    consecutiveLosses: 0,
    cooldown: null,
    killSwitchStatus: KillSwitchStatus.ACTIVE,
    emergencyStopActive: false,
    circuitBreakers: [],
  };
}

function riskEvaluationService(decision: RiskDecision): RiskEvaluationService {
  return {
    evaluate: jest.fn().mockResolvedValue(decision),
  } as unknown as RiskEvaluationService;
}

describe('RiskManagementRule', () => {
  it('skips evaluation entirely when the emergency-escape-hatch flag is enabled', async () => {
    const evaluationService = riskEvaluationService({
      allowed: true,
      reasonCode: null,
      message: 'ok',
      evaluatedAt: new Date().toISOString(),
      riskSnapshot: riskSnapshot(),
    });
    const rule = new RiskManagementRule(
      evaluationService,
      featureFlagsService(true),
      new FakeClock(),
    );
    const context = new ValidationContext(buildValidationRequest());
    context.resolvedInstrument = buildResolvedInstrument();

    const result = await rule.validate(context);

    expect(result.isSuccess).toBe(true);
    expect(evaluationService.evaluate).not.toHaveBeenCalled();
  });

  it('passes through when resolvedInstrument has not been set yet (defensive, earlier rule should have stopped the chain)', async () => {
    const evaluationService = riskEvaluationService({
      allowed: true,
      reasonCode: null,
      message: 'ok',
      evaluatedAt: new Date().toISOString(),
      riskSnapshot: riskSnapshot(),
    });
    const rule = new RiskManagementRule(
      evaluationService,
      featureFlagsService(false),
      new FakeClock(),
    );
    const context = new ValidationContext(buildValidationRequest());

    const result = await rule.validate(context);

    expect(result.isSuccess).toBe(true);
    expect(evaluationService.evaluate).not.toHaveBeenCalled();
  });

  it('passes when the risk evaluation approves the trade', async () => {
    const evaluationService = riskEvaluationService({
      allowed: true,
      reasonCode: null,
      message: 'Trade approved by risk management',
      evaluatedAt: new Date().toISOString(),
      riskSnapshot: riskSnapshot(),
    });
    const rule = new RiskManagementRule(
      evaluationService,
      featureFlagsService(false),
      new FakeClock(),
    );
    const context = new ValidationContext(
      buildValidationRequest({ quantity: 50 }),
    );
    context.resolvedInstrument = buildResolvedInstrument();

    const result = await rule.validate(context);

    expect(result.isSuccess).toBe(true);
    expect(evaluationService.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        instrumentToken: 'TOKEN-1',
        tradingSymbol: 'NIFTY24500CE',
        quantity: 50,
      }),
    );
  });

  it('fails with RISK_MANAGEMENT_REJECTED when the risk evaluation rejects the trade', async () => {
    const evaluationService = riskEvaluationService({
      allowed: false,
      reasonCode: RiskReasonCode.MAX_OPEN_TRADES_REACHED,
      message: 'Maximum open trades reached (3)',
      evaluatedAt: new Date().toISOString(),
      riskSnapshot: riskSnapshot(),
    });
    const rule = new RiskManagementRule(
      evaluationService,
      featureFlagsService(false),
      new FakeClock(),
    );
    const context = new ValidationContext(buildValidationRequest());
    context.resolvedInstrument = buildResolvedInstrument();

    const result = await rule.validate(context);

    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe(
      ValidationFailureCode.RISK_MANAGEMENT_REJECTED,
    );
    expect(result.error.message).toBe('Maximum open trades reached (3)');
  });
});
