import {
  IllegalTradeStateTransitionException,
  InvalidTradeDefinitionException,
} from '@modules/trading-engine/exceptions';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import { RetryStrategy } from './retry-strategy';

const options = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  jitterRatio: 0.2,
};

describe('RetryStrategy', () => {
  it('doubles the delay exponentially with each attempt (zero jitter)', () => {
    const zeroRandom = () => 0;
    expect(RetryStrategy.computeDelayMs(1, options, zeroRandom)).toBe(500);
    expect(RetryStrategy.computeDelayMs(2, options, zeroRandom)).toBe(1_000);
    expect(RetryStrategy.computeDelayMs(3, options, zeroRandom)).toBe(2_000);
  });

  it('caps the delay at maxDelayMs', () => {
    const zeroRandom = () => 0;
    expect(RetryStrategy.computeDelayMs(10, options, zeroRandom)).toBe(10_000);
  });

  it('hasExceededMaxRetries is false within the limit and true beyond it', () => {
    expect(RetryStrategy.hasExceededMaxRetries(3, options)).toBe(false);
    expect(RetryStrategy.hasExceededMaxRetries(4, options)).toBe(true);
  });

  describe('failure classification', () => {
    it('treats InvalidTradeDefinitionException as permanent (never retried)', () => {
      const error = new InvalidTradeDefinitionException('bad definition');
      expect(RetryStrategy.isPermanentFailure(error)).toBe(true);
      expect(RetryStrategy.isRetryableFailure(error)).toBe(false);
    });

    it('treats IllegalTradeStateTransitionException as permanent (never retried)', () => {
      const error = new IllegalTradeStateTransitionException(
        TradeState.DRAFT,
        TradeState.ACTIVE,
      );
      expect(RetryStrategy.isPermanentFailure(error)).toBe(true);
    });

    it('treats an unexpected/unknown error as transient (retryable)', () => {
      const error = new Error('connection reset');
      expect(RetryStrategy.isPermanentFailure(error)).toBe(false);
      expect(RetryStrategy.isRetryableFailure(error)).toBe(true);
    });
  });
});
