import { CircuitBreakerStatus } from '../models/circuit-breaker.model';
import { CircuitBreaker } from './circuit-breaker';

describe('CircuitBreaker', () => {
  const options = { failureThreshold: 3, openDurationMs: 10_000 };

  it('starts CLOSED', () => {
    const breaker = new CircuitBreaker(options);
    expect(breaker.getStatus()).toBe(CircuitBreakerStatus.CLOSED);
    expect(breaker.canAttempt(0)).toBe(true);
  });

  it('stays CLOSED below the failure threshold', () => {
    const breaker = new CircuitBreaker(options);
    breaker.recordFailure(1);
    breaker.recordFailure(2);
    expect(breaker.getStatus()).toBe(CircuitBreakerStatus.CLOSED);
  });

  it('opens once consecutive failures reach the threshold', () => {
    const breaker = new CircuitBreaker(options);
    breaker.recordFailure(1);
    breaker.recordFailure(2);
    breaker.recordFailure(3);
    expect(breaker.getStatus()).toBe(CircuitBreakerStatus.OPEN);
    expect(breaker.canAttempt(3)).toBe(false);
  });

  it('resets consecutive failures on success while CLOSED', () => {
    const breaker = new CircuitBreaker(options);
    breaker.recordFailure(1);
    breaker.recordFailure(2);
    breaker.recordSuccess(3);
    breaker.recordFailure(4);
    breaker.recordFailure(5);
    expect(breaker.getStatus()).toBe(CircuitBreakerStatus.CLOSED);
  });

  it('does not allow attempts while OPEN before the open duration elapses', () => {
    const breaker = new CircuitBreaker(options);
    breaker.recordFailure(0);
    breaker.recordFailure(1);
    breaker.recordFailure(2);
    expect(breaker.canAttempt(5_000)).toBe(false);
  });

  it('allows an attempt and transitions to HALF_OPEN once the open duration elapses', () => {
    const breaker = new CircuitBreaker(options);
    breaker.recordFailure(0);
    breaker.recordFailure(1);
    breaker.recordFailure(2);
    expect(breaker.canAttempt(12_000)).toBe(true);
    breaker.onBeforeAttempt(12_000);
    expect(breaker.getStatus()).toBe(CircuitBreakerStatus.HALF_OPEN);
  });

  it('closes on a successful attempt while HALF_OPEN', () => {
    const breaker = new CircuitBreaker(options);
    breaker.recordFailure(0);
    breaker.recordFailure(1);
    breaker.recordFailure(2);
    breaker.onBeforeAttempt(12_000);
    breaker.recordSuccess(12_100);
    expect(breaker.getStatus()).toBe(CircuitBreakerStatus.CLOSED);
    expect(breaker.snapshot().consecutiveFailures).toBe(0);
  });

  it('re-opens and restarts the open-duration timer on a failure while HALF_OPEN', () => {
    const breaker = new CircuitBreaker(options);
    breaker.recordFailure(0);
    breaker.recordFailure(1);
    breaker.recordFailure(2);
    breaker.onBeforeAttempt(12_000);
    breaker.recordFailure(12_100);
    expect(breaker.getStatus()).toBe(CircuitBreakerStatus.OPEN);
    expect(breaker.canAttempt(12_200)).toBe(false);
    expect(breaker.canAttempt(22_200)).toBe(true);
  });

  it('checkRecovery transitions OPEN -> HALF_OPEN once due, and is a no-op otherwise', () => {
    const breaker = new CircuitBreaker(options);
    breaker.recordFailure(0);
    breaker.recordFailure(1);
    breaker.recordFailure(2);
    breaker.checkRecovery(5_000);
    expect(breaker.getStatus()).toBe(CircuitBreakerStatus.OPEN);
    breaker.checkRecovery(10_002);
    expect(breaker.getStatus()).toBe(CircuitBreakerStatus.HALF_OPEN);
  });

  it('snapshot reports timestamps for open/failure/success', () => {
    const breaker = new CircuitBreaker(options);
    breaker.recordFailure(0);
    breaker.recordFailure(1);
    breaker.recordFailure(2);
    const snapshot = breaker.snapshot();
    expect(snapshot.status).toBe(CircuitBreakerStatus.OPEN);
    expect(snapshot.openedAtMs).toBe(2);
    expect(snapshot.lastFailureAtMs).toBe(2);
    expect(snapshot.lastSuccessAtMs).toBeNull();
  });
});
