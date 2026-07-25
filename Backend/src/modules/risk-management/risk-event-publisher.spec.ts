import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { RiskEventPublisher } from './risk-event-publisher';
import { RiskReasonCode } from './models/risk-reason-code.enum';
import { KillSwitchStatus } from './models/kill-switch-status.enum';
import { CircuitBreakerName } from './models/circuit-breaker.model';
import { CooldownReason } from './models/cooldown.model';
import { DEFAULT_RISK_POLICY } from './models/risk-policy.model';
import type { RiskSnapshot } from './models/risk-snapshot.model';

function snapshot(): RiskSnapshot {
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
  };
}

describe('RiskEventPublisher', () => {
  function build() {
    const publish = jest.fn();
    const eventBus = {
      publish,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    } as unknown as IEventBus;
    return { publisher: new RiskEventPublisher(eventBus), publish };
  }

  it('publishes one correctly-named event per method', () => {
    const { publisher, publish } = build();

    publisher.evaluationStarted('RELIANCE');
    publisher.evaluationCompleted('RELIANCE', {
      allowed: true,
      reasonCode: null,
      message: 'ok',
      evaluatedAt: new Date().toISOString(),
      riskSnapshot: snapshot(),
    });
    publisher.tradeApproved('RELIANCE', snapshot());
    publisher.tradeRejected(
      'RELIANCE',
      10,
      RiskReasonCode.DUPLICATE_POSITION,
      'duplicate',
      snapshot(),
    );
    publisher.dailyLossLimitBreached(-5_000, 5_000);
    publisher.exposureLimitBreached('RELIANCE', 100_000, 90_000);
    publisher.maxOpenTradesReached(3, 3);
    publisher.cooldownStarted(
      CooldownReason.STOP_LOSS_HIT,
      new Date().toISOString(),
    );
    publisher.cooldownEnded(CooldownReason.STOP_LOSS_HIT);
    publisher.consecutiveLossLimitBreached(3, 3);
    publisher.killSwitchActivated(
      KillSwitchStatus.TRADING_DISABLED,
      'reason',
      'operator',
    );
    publisher.killSwitchDeactivated('operator');
    publisher.emergencyStopActivated('reason', 'system');
    publisher.emergencyStopReset('operator');
    publisher.circuitBreakerOpened(CircuitBreakerName.BROKER, 3);
    publisher.circuitBreakerHalfOpened(CircuitBreakerName.BROKER);
    publisher.circuitBreakerClosed(CircuitBreakerName.BROKER);

    expect(publish).toHaveBeenCalledTimes(17);
    const eventNames = publish.mock.calls.map(
      ([event]) => (event as { eventName: string }).eventName,
    );
    expect(new Set(eventNames).size).toBe(17);
    expect(
      eventNames.every((name) => name.startsWith('risk-management.')),
    ).toBe(true);
  });
});
