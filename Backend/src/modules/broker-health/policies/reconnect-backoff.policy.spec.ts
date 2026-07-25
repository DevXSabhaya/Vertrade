import { ReconnectBackoffPolicy } from './reconnect-backoff.policy';

const options = {
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  jitterRatio: 0.2,
  retryCount: 3,
};

describe('ReconnectBackoffPolicy', () => {
  it('doubles the delay exponentially with each attempt (zero jitter)', () => {
    const zeroRandom = () => 0;
    expect(ReconnectBackoffPolicy.computeDelayMs(1, options, zeroRandom)).toBe(
      1_000,
    );
    expect(ReconnectBackoffPolicy.computeDelayMs(2, options, zeroRandom)).toBe(
      2_000,
    );
    expect(ReconnectBackoffPolicy.computeDelayMs(3, options, zeroRandom)).toBe(
      4_000,
    );
  });

  it('caps the delay at maxDelayMs', () => {
    const zeroRandom = () => 0;
    expect(ReconnectBackoffPolicy.computeDelayMs(10, options, zeroRandom)).toBe(
      30_000,
    );
  });

  it('adds jitter proportional to jitterRatio', () => {
    const halfRandom = () => 0.5;
    expect(ReconnectBackoffPolicy.computeDelayMs(1, options, halfRandom)).toBe(
      1_100,
    );
  });

  it('hasExceededRetryCount is false within the limit and true beyond it', () => {
    expect(ReconnectBackoffPolicy.hasExceededRetryCount(3, options)).toBe(
      false,
    );
    expect(ReconnectBackoffPolicy.hasExceededRetryCount(4, options)).toBe(true);
  });
});
