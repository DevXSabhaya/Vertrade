import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { RiskDecision } from './models/risk-decision.model';
import type { RiskSnapshot } from './models/risk-snapshot.model';
import type { RiskReasonCode } from './models/risk-reason-code.enum';
import type { CooldownReason } from './models/cooldown.model';
import type { KillSwitchStatus } from './models/kill-switch-status.enum';
import type { CircuitBreakerName } from './models/circuit-breaker.model';
import {
  RiskEvaluationStartedEvent,
  RiskEvaluationCompletedEvent,
  TradeRiskApprovedEvent,
  TradeRiskRejectedEvent,
  DailyLossLimitBreachedEvent,
  ExposureLimitBreachedEvent,
  MaxOpenTradesReachedEvent,
  CooldownStartedEvent,
  CooldownEndedEvent,
  ConsecutiveLossLimitBreachedEvent,
  KillSwitchActivatedEvent,
  KillSwitchDeactivatedEvent,
  EmergencyStopActivatedEvent,
  EmergencyStopResetEvent,
  CircuitBreakerOpenedEvent,
  CircuitBreakerHalfOpenedEvent,
  CircuitBreakerClosedEvent,
} from './events';

/**
 * The single place every risk-domain component publishes an event from —
 * same purpose as Phase 9's `RecoveryEventPublisher`: keeps every other
 * class free of a direct `EVENT_BUS` dependency and centralizes the exact
 * shape of each event in one file.
 */
@Injectable()
export class RiskEventPublisher {
  constructor(@Inject(EVENT_BUS) private readonly eventBus: IEventBus) {}

  evaluationStarted(rawSymbol: string): void {
    this.eventBus.publish(new RiskEvaluationStartedEvent(rawSymbol));
  }

  evaluationCompleted(rawSymbol: string, decision: RiskDecision): void {
    this.eventBus.publish(
      new RiskEvaluationCompletedEvent(rawSymbol, decision),
    );
  }

  tradeApproved(rawSymbol: string, snapshot: RiskSnapshot): void {
    this.eventBus.publish(new TradeRiskApprovedEvent(rawSymbol, snapshot));
  }

  tradeRejected(
    rawSymbol: string,
    requestedQuantity: number,
    reasonCode: RiskReasonCode,
    message: string,
    snapshot: RiskSnapshot,
  ): void {
    this.eventBus.publish(
      new TradeRiskRejectedEvent(
        rawSymbol,
        requestedQuantity,
        reasonCode,
        message,
        snapshot,
      ),
    );
  }

  dailyLossLimitBreached(realizedPnl: number, limit: number): void {
    this.eventBus.publish(new DailyLossLimitBreachedEvent(realizedPnl, limit));
  }

  exposureLimitBreached(
    rawSymbol: string,
    attemptedExposure: number,
    limit: number,
  ): void {
    this.eventBus.publish(
      new ExposureLimitBreachedEvent(rawSymbol, attemptedExposure, limit),
    );
  }

  maxOpenTradesReached(openTradeCount: number, limit: number): void {
    this.eventBus.publish(new MaxOpenTradesReachedEvent(openTradeCount, limit));
  }

  cooldownStarted(reason: CooldownReason, expiresAt: string): void {
    this.eventBus.publish(new CooldownStartedEvent(reason, expiresAt));
  }

  cooldownEnded(reason: CooldownReason): void {
    this.eventBus.publish(new CooldownEndedEvent(reason));
  }

  consecutiveLossLimitBreached(consecutiveLosses: number, limit: number): void {
    this.eventBus.publish(
      new ConsecutiveLossLimitBreachedEvent(consecutiveLosses, limit),
    );
  }

  killSwitchActivated(
    status: KillSwitchStatus,
    reason: string,
    activatedBy: string,
  ): void {
    this.eventBus.publish(
      new KillSwitchActivatedEvent(status, reason, activatedBy),
    );
  }

  killSwitchDeactivated(deactivatedBy: string): void {
    this.eventBus.publish(new KillSwitchDeactivatedEvent(deactivatedBy));
  }

  emergencyStopActivated(reason: string, triggeredBy: string): void {
    this.eventBus.publish(new EmergencyStopActivatedEvent(reason, triggeredBy));
  }

  emergencyStopReset(resetBy: string): void {
    this.eventBus.publish(new EmergencyStopResetEvent(resetBy));
  }

  circuitBreakerOpened(
    breaker: CircuitBreakerName,
    consecutiveFailures: number,
  ): void {
    this.eventBus.publish(
      new CircuitBreakerOpenedEvent(breaker, consecutiveFailures),
    );
  }

  circuitBreakerHalfOpened(breaker: CircuitBreakerName): void {
    this.eventBus.publish(new CircuitBreakerHalfOpenedEvent(breaker));
  }

  circuitBreakerClosed(breaker: CircuitBreakerName): void {
    this.eventBus.publish(new CircuitBreakerClosedEvent(breaker));
  }
}
