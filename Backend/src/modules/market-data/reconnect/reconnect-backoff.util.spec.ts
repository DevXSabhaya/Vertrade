import { ReconnectBackoff } from './reconnect-backoff.util';

const options = { baseDelayMs: 1_000, maxDelayMs: 30_000, jitterRatio: 0.2 };

describe('ReconnectBackoff', () => {
  it('doubles the delay exponentially with each attempt (zero jitter)', () => {
    const zeroRandom = () => 0;
    expect(ReconnectBackoff.computeDelayMs(1, options, zeroRandom)).toBe(1_000);
    expect(ReconnectBackoff.computeDelayMs(2, options, zeroRandom)).toBe(2_000);
    expect(ReconnectBackoff.computeDelayMs(3, options, zeroRandom)).toBe(4_000);
    expect(ReconnectBackoff.computeDelayMs(4, options, zeroRandom)).toBe(8_000);
  });

  it('caps the delay at maxDelayMs regardless of attempt count', () => {
    const zeroRandom = () => 0;
    expect(ReconnectBackoff.computeDelayMs(10, options, zeroRandom)).toBe(
      30_000,
    );
    expect(ReconnectBackoff.computeDelayMs(100, options, zeroRandom)).toBe(
      30_000,
    );
  });

  it('adds jitter proportional to jitterRatio and the random source', () => {
    const halfRandom = () => 0.5;
    // attempt 1: exponential = 1000, jitter = 1000 * 0.2 * 0.5 = 100
    expect(ReconnectBackoff.computeDelayMs(1, options, halfRandom)).toBe(1_100);
  });

  it('never exceeds maxDelayMs even after jitter is added', () => {
    const maxRandom = () => 1;
    const delay = ReconnectBackoff.computeDelayMs(5, options, maxRandom);
    expect(delay).toBeLessThanOrEqual(options.maxDelayMs);
  });

  it('is deterministic for a fixed random source', () => {
    const fixedRandom = () => 0.3;
    const first = ReconnectBackoff.computeDelayMs(2, options, fixedRandom);
    const second = ReconnectBackoff.computeDelayMs(2, options, fixedRandom);
    expect(first).toBe(second);
  });

  describe('hasExceededMaxRetries', () => {
    it('is false while attempt is within maxRetries', () => {
      expect(ReconnectBackoff.hasExceededMaxRetries(1, { maxRetries: 3 })).toBe(
        false,
      );
      expect(ReconnectBackoff.hasExceededMaxRetries(3, { maxRetries: 3 })).toBe(
        false,
      );
    });

    it('is true once attempt exceeds maxRetries', () => {
      expect(ReconnectBackoff.hasExceededMaxRetries(4, { maxRetries: 3 })).toBe(
        true,
      );
    });
  });
});
