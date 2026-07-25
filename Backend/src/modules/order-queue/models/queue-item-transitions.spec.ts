import { QueueItemState } from './queue-item-state.enum';
import { QueueItemTransitions } from './queue-item-transitions';
import { IllegalQueueItemTransitionException } from '../exceptions/illegal-queue-item-transition.exception';

describe('QueueItemTransitions', () => {
  it('allows the full happy-path flow', () => {
    expect(
      QueueItemTransitions.canTransition(
        QueueItemState.QUEUED,
        QueueItemState.LOCKED,
      ),
    ).toBe(true);
    expect(
      QueueItemTransitions.canTransition(
        QueueItemState.LOCKED,
        QueueItemState.PROCESSING,
      ),
    ).toBe(true);
    expect(
      QueueItemTransitions.canTransition(
        QueueItemState.PROCESSING,
        QueueItemState.SUBMITTED,
      ),
    ).toBe(true);
    expect(
      QueueItemTransitions.canTransition(
        QueueItemState.SUBMITTED,
        QueueItemState.COMPLETED,
      ),
    ).toBe(true);
  });

  it('allows the retry loop', () => {
    expect(
      QueueItemTransitions.canTransition(
        QueueItemState.PROCESSING,
        QueueItemState.RETRYING,
      ),
    ).toBe(true);
    expect(
      QueueItemTransitions.canTransition(
        QueueItemState.RETRYING,
        QueueItemState.LOCKED,
      ),
    ).toBe(true);
    expect(
      QueueItemTransitions.canTransition(
        QueueItemState.RETRYING,
        QueueItemState.FAILED,
      ),
    ).toBe(true);
  });

  it('allows QUEUED to be cancelled, expired, retried, or fail outright (e.g. lock never acquired)', () => {
    expect(
      QueueItemTransitions.canTransition(
        QueueItemState.QUEUED,
        QueueItemState.CANCELLED,
      ),
    ).toBe(true);
    expect(
      QueueItemTransitions.canTransition(
        QueueItemState.QUEUED,
        QueueItemState.EXPIRED,
      ),
    ).toBe(true);
    expect(
      QueueItemTransitions.canTransition(
        QueueItemState.QUEUED,
        QueueItemState.FAILED,
      ),
    ).toBe(true);
    expect(
      QueueItemTransitions.canTransition(
        QueueItemState.QUEUED,
        QueueItemState.RETRYING,
      ),
    ).toBe(true);
  });

  it('rejects illegal transitions such as QUEUED -> PROCESSING directly', () => {
    expect(
      QueueItemTransitions.canTransition(
        QueueItemState.QUEUED,
        QueueItemState.PROCESSING,
      ),
    ).toBe(false);
  });

  it('treats COMPLETED, FAILED, CANCELLED, EXPIRED as terminal', () => {
    for (const terminal of [
      QueueItemState.COMPLETED,
      QueueItemState.FAILED,
      QueueItemState.CANCELLED,
      QueueItemState.EXPIRED,
    ]) {
      expect(QueueItemTransitions.isTerminal(terminal)).toBe(true);
      expect(
        QueueItemTransitions.canTransition(terminal, QueueItemState.LOCKED),
      ).toBe(false);
    }
  });

  it('assertTransition throws IllegalQueueItemTransitionException for an illegal move', () => {
    expect(() =>
      QueueItemTransitions.assertTransition(
        QueueItemState.COMPLETED,
        QueueItemState.LOCKED,
      ),
    ).toThrow(IllegalQueueItemTransitionException);
  });
});
