import { CircuitBreakerStatus } from '../models/circuit-breaker.model';

export interface CircuitBreakerOptions {
  readonly failureThreshold: number;
  readonly openDurationMs: number;
}

/**
 * A single, dependency-free circuit breaker (Part 12 of the spec):
 * CLOSED -> (failureThreshold consecutive failures) -> OPEN
 * OPEN -> (openDurationMs elapses) -> HALF_OPEN
 * HALF_OPEN -> (one success) -> CLOSED
 * HALF_OPEN -> (one failure) -> OPEN (restarts the open-duration timer)
 * No I/O, no timers of its own — `CircuitBreakerService` drives it from real
 * events and a scheduled recovery check, exactly like `TrailingCalculator`
 * (Phase 10) is pure math driven by a tick handler.
 */
export class CircuitBreaker {
  private status: CircuitBreakerStatus = CircuitBreakerStatus.CLOSED;
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private lastFailureAt: number | null = null;
  private lastSuccessAt: number | null = null;

  constructor(private readonly options: CircuitBreakerOptions) {}

  getStatus(): CircuitBreakerStatus {
    return this.status;
  }

  /** Whether a call may currently be attempted through the protected dependency. */
  canAttempt(nowMs: number): boolean {
    if (this.status === CircuitBreakerStatus.OPEN) {
      return this.hasOpenDurationElapsed(nowMs);
    }
    return true;
  }

  /** Call before actually attempting the protected operation — transitions OPEN -> HALF_OPEN once the open duration has elapsed. */
  onBeforeAttempt(nowMs: number): void {
    if (
      this.status === CircuitBreakerStatus.OPEN &&
      this.hasOpenDurationElapsed(nowMs)
    ) {
      this.status = CircuitBreakerStatus.HALF_OPEN;
    }
  }

  recordSuccess(nowMs: number): void {
    this.lastSuccessAt = nowMs;
    this.consecutiveFailures = 0;
    this.status = CircuitBreakerStatus.CLOSED;
    this.openedAt = null;
  }

  recordFailure(nowMs: number): void {
    this.lastFailureAt = nowMs;
    if (this.status === CircuitBreakerStatus.HALF_OPEN) {
      this.open(nowMs);
      return;
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.open(nowMs);
    }
  }

  /** Recovery check driven by the scheduler — transitions OPEN -> HALF_OPEN once due, otherwise a no-op. */
  checkRecovery(nowMs: number): void {
    if (
      this.status === CircuitBreakerStatus.OPEN &&
      this.hasOpenDurationElapsed(nowMs)
    ) {
      this.status = CircuitBreakerStatus.HALF_OPEN;
    }
  }

  snapshot(): {
    status: CircuitBreakerStatus;
    consecutiveFailures: number;
    openedAtMs: number | null;
    lastFailureAtMs: number | null;
    lastSuccessAtMs: number | null;
  } {
    return {
      status: this.status,
      consecutiveFailures: this.consecutiveFailures,
      openedAtMs: this.openedAt,
      lastFailureAtMs: this.lastFailureAt,
      lastSuccessAtMs: this.lastSuccessAt,
    };
  }

  private open(nowMs: number): void {
    this.status = CircuitBreakerStatus.OPEN;
    this.openedAt = nowMs;
  }

  private hasOpenDurationElapsed(nowMs: number): boolean {
    return (
      this.openedAt !== null &&
      nowMs - this.openedAt >= this.options.openDurationMs
    );
  }
}
