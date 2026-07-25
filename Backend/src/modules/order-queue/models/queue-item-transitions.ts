import { QueueItemState } from './queue-item-state.enum';
import { IllegalQueueItemTransitionException } from '../exceptions/illegal-queue-item-transition.exception';

const TERMINAL_STATES: ReadonlySet<QueueItemState> = new Set([
  QueueItemState.COMPLETED,
  QueueItemState.FAILED,
  QueueItemState.CANCELLED,
  QueueItemState.EXPIRED,
]);

const TRANSITION_TABLE: ReadonlyMap<
  QueueItemState,
  ReadonlySet<QueueItemState>
> = new Map([
  [
    QueueItemState.QUEUED,
    new Set([
      QueueItemState.LOCKED,
      QueueItemState.CANCELLED,
      QueueItemState.EXPIRED,
      QueueItemState.FAILED,
      // A lock-acquisition failure happens before the item is ever LOCKED,
      // but is retried through the exact same RETRYING path a processing
      // failure would use.
      QueueItemState.RETRYING,
    ]),
  ],
  [
    QueueItemState.LOCKED,
    new Set([QueueItemState.PROCESSING, QueueItemState.FAILED]),
  ],
  [
    QueueItemState.PROCESSING,
    new Set([
      QueueItemState.SUBMITTED,
      QueueItemState.RETRYING,
      QueueItemState.FAILED,
    ]),
  ],
  [QueueItemState.SUBMITTED, new Set([QueueItemState.COMPLETED])],
  [
    QueueItemState.RETRYING,
    new Set([QueueItemState.LOCKED, QueueItemState.FAILED]),
  ],
  [QueueItemState.COMPLETED, new Set()],
  [QueueItemState.FAILED, new Set()],
  [QueueItemState.CANCELLED, new Set()],
  [QueueItemState.EXPIRED, new Set()],
]);

export const QueueItemTransitions = {
  isTerminal(state: QueueItemState): boolean {
    return TERMINAL_STATES.has(state);
  },

  canTransition(from: QueueItemState, to: QueueItemState): boolean {
    return TRANSITION_TABLE.get(from)?.has(to) ?? false;
  },

  assertTransition(from: QueueItemState, to: QueueItemState): void {
    if (!this.canTransition(from, to)) {
      throw new IllegalQueueItemTransitionException(from, to);
    }
  },
};
