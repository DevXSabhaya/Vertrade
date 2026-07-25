import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { BrokerHealthyEvent } from '@modules/broker-health/events/broker-healthy.event';
import { BrokerDisconnectedEvent } from '@modules/broker-health/events/broker-disconnected.event';
import { MarketDataConnectedEvent } from '@modules/market-data/events/market-data-connected.event';
import { MarketDataDisconnectedEvent } from '@modules/market-data/events/market-data-disconnected.event';
import { OrderCompletedEvent } from '@modules/order-queue/events/order-completed.event';
import { OrderFailedEvent } from '@modules/order-queue/events/order-failed.event';
import { CircuitBreaker } from './domain/circuit-breaker';
import {
  CircuitBreakerName,
  CircuitBreakerStatus,
  type CircuitBreakerSnapshot,
} from './models/circuit-breaker.model';
import { RiskPolicyService } from './risk-policy.service';
import { RiskEventPublisher } from './risk-event-publisher';

/**
 * Part 12 of the spec — one named `CircuitBreaker` (pure domain class) per
 * external dependency the risk gate cares about, driven entirely by events
 * already published elsewhere in the system (Phase 6's Market Data
 * connection events, Phase 8's Broker Health events, Phase 7's Order Queue
 * completion/failure events) — this service never polls or probes anything
 * itself, and never duplicates BrokerHealthService's/MarketDataService's own
 * reconnect logic; it only aggregates their outcomes for the purpose of
 * gating *new* risk-evaluated trades. Deliberately not persisted — a fresh
 * CLOSED state on every restart is the safe default (a stale OPEN state
 * surviving a restart could block trading indefinitely for a since-resolved
 * issue), consistent with the spec never listing circuit breaker state under
 * Part 20's persistence requirements.
 */
@Injectable()
export class CircuitBreakerService implements OnModuleInit {
  private readonly breakers = new Map<CircuitBreakerName, CircuitBreaker>();

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly riskPolicyService: RiskPolicyService,
    private readonly eventPublisher: RiskEventPublisher,
  ) {
    for (const name of Object.values(CircuitBreakerName)) {
      this.breakers.set(name, this.buildBreaker());
    }
  }

  onModuleInit(): void {
    this.eventBus.subscribe<BrokerHealthyEvent>(
      BrokerHealthyEvent.EVENT_NAME,
      () => this.recordSuccess(CircuitBreakerName.BROKER),
    );
    this.eventBus.subscribe<BrokerDisconnectedEvent>(
      BrokerDisconnectedEvent.EVENT_NAME,
      () => this.recordFailure(CircuitBreakerName.BROKER),
    );
    this.eventBus.subscribe<MarketDataConnectedEvent>(
      MarketDataConnectedEvent.EVENT_NAME,
      () => this.recordSuccess(CircuitBreakerName.MARKET_DATA),
    );
    this.eventBus.subscribe<MarketDataDisconnectedEvent>(
      MarketDataDisconnectedEvent.EVENT_NAME,
      () => this.recordFailure(CircuitBreakerName.MARKET_DATA),
    );
    this.eventBus.subscribe<OrderCompletedEvent>(
      OrderCompletedEvent.EVENT_NAME,
      () => this.recordSuccess(CircuitBreakerName.ORDER_EXECUTION),
    );
    this.eventBus.subscribe<OrderFailedEvent>(OrderFailedEvent.EVENT_NAME, () =>
      this.recordFailure(CircuitBreakerName.ORDER_EXECUTION),
    );
  }

  /** Called by the scheduler's maintenance job so an OPEN breaker transitions to HALF_OPEN once its open duration elapses, even with no fresh events arriving. */
  checkRecovery(): void {
    const now = this.clock.now().getTime();
    for (const [name, breaker] of this.breakers) {
      const before = breaker.getStatus();
      breaker.checkRecovery(now);
      const after = breaker.getStatus();
      if (
        before === CircuitBreakerStatus.OPEN &&
        after === CircuitBreakerStatus.HALF_OPEN
      ) {
        this.eventPublisher.circuitBreakerHalfOpened(name);
      }
    }
  }

  getSnapshot(name: CircuitBreakerName): CircuitBreakerSnapshot {
    const breaker = this.requireBreaker(name);
    const s = breaker.snapshot();
    return {
      name,
      status: s.status,
      consecutiveFailures: s.consecutiveFailures,
      openedAt:
        s.openedAtMs === null ? null : new Date(s.openedAtMs).toISOString(),
      lastFailureAt:
        s.lastFailureAtMs === null
          ? null
          : new Date(s.lastFailureAtMs).toISOString(),
      lastSuccessAt:
        s.lastSuccessAtMs === null
          ? null
          : new Date(s.lastSuccessAtMs).toISOString(),
    };
  }

  getAllSnapshots(): CircuitBreakerSnapshot[] {
    return Object.values(CircuitBreakerName).map((name) =>
      this.getSnapshot(name),
    );
  }

  private recordSuccess(name: CircuitBreakerName): void {
    this.requireBreaker(name).recordSuccess(this.clock.now().getTime());
    this.eventPublisher.circuitBreakerClosed(name);
  }

  private recordFailure(name: CircuitBreakerName): void {
    const breaker = this.requireBreaker(name);
    const before = breaker.getStatus();
    breaker.recordFailure(this.clock.now().getTime());
    const after = breaker.getStatus();
    if (
      before !== CircuitBreakerStatus.OPEN &&
      after === CircuitBreakerStatus.OPEN
    ) {
      const failures = breaker.snapshot().consecutiveFailures;
      this.eventPublisher.circuitBreakerOpened(name, failures);
    }
  }

  private requireBreaker(name: CircuitBreakerName): CircuitBreaker {
    const breaker = this.breakers.get(name);
    if (!breaker) {
      throw new Error(`No circuit breaker registered for ${name}`);
    }
    return breaker;
  }

  private buildBreaker(): CircuitBreaker {
    const policy = this.riskPolicyService.getPolicy();
    return new CircuitBreaker({
      failureThreshold: policy.circuitBreakerFailureThreshold,
      openDurationMs: policy.circuitBreakerOpenDurationMs,
    });
  }
}
