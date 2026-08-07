import { QueueItem } from './queue-item.aggregate';
import { QueueItemState } from './queue-item-state.enum';
import { QueueItemType } from './queue-item-type.enum';
import { IllegalQueueItemTransitionException } from '../exceptions/illegal-queue-item-transition.exception';
import { FakeClock } from '../testing/fake-clock';
import {
  buildRequest,
  buildResolvedInstrument,
} from '../testing/build-fixtures';

function buildItem(clock: FakeClock): QueueItem {
  return new QueueItem(
    'item-1',
    'user-1',
    'idem-1',
    QueueItemType.CREATE_TRADE,
    buildRequest(),
    buildResolvedInstrument(),
    clock.now(),
  );
}

describe('QueueItem aggregate', () => {
  it('starts QUEUED with one history entry', () => {
    const item = buildItem(new FakeClock());
    expect(item.state).toBe(QueueItemState.QUEUED);
    expect(item.toSnapshot().history).toHaveLength(1);
  });

  it('walks the full happy path: QUEUED -> LOCKED -> PROCESSING -> SUBMITTED -> COMPLETED', () => {
    const clock = new FakeClock();
    const item = buildItem(clock);

    item.lock('worker-1', clock);
    expect(item.state).toBe(QueueItemState.LOCKED);
    expect(item.lockOwner).toBe('worker-1');

    item.beginProcessing(clock);
    expect(item.state).toBe(QueueItemState.PROCESSING);

    item.markSubmitted('trade-1', clock);
    expect(item.state).toBe(QueueItemState.SUBMITTED);
    expect(item.resultTradeId).toBe('trade-1');

    item.markCompleted(clock);
    expect(item.state).toBe(QueueItemState.COMPLETED);
    expect(item.lockOwner).toBeNull();
  });

  it('scheduleRetry increments attempts, clears the lock, and moves to RETRYING', () => {
    const clock = new FakeClock();
    const item = buildItem(clock);
    item.lock('worker-1', clock);
    item.beginProcessing(clock);

    item.scheduleRetry('transient failure', clock);

    expect(item.state).toBe(QueueItemState.RETRYING);
    expect(item.attempts).toBe(1);
    expect(item.lockOwner).toBeNull();
    expect(item.lastError).toBe('transient failure');
  });

  it('a retried item can be re-locked and re-processed', () => {
    const clock = new FakeClock();
    const item = buildItem(clock);
    item.lock('worker-1', clock);
    item.beginProcessing(clock);
    item.scheduleRetry('transient failure', clock);

    item.lock('worker-1', clock); // RETRYING -> LOCKED
    expect(item.state).toBe(QueueItemState.LOCKED);
  });

  it('markFailed sets lastError and clears the lock', () => {
    const clock = new FakeClock();
    const item = buildItem(clock);
    item.lock('worker-1', clock);
    item.beginProcessing(clock);

    item.markFailed('permanent failure', clock);

    expect(item.state).toBe(QueueItemState.FAILED);
    expect(item.lastError).toBe('permanent failure');
    expect(item.lockOwner).toBeNull();
  });

  it('cancel() only succeeds from QUEUED', () => {
    const clock = new FakeClock();
    const item = buildItem(clock);
    item.cancel('user cancelled', clock);
    expect(item.state).toBe(QueueItemState.CANCELLED);
  });

  it('throws IllegalQueueItemTransitionException for an invalid transition', () => {
    const clock = new FakeClock();
    const item = buildItem(clock);
    item.lock('worker-1', clock);
    item.beginProcessing(clock);
    item.markSubmitted('trade-1', clock);
    item.markCompleted(clock);

    expect(() => item.cancel('too late', clock)).toThrow(
      IllegalQueueItemTransitionException,
    );
  });

  it('resetForRecovery always returns the item to QUEUED and clears the lock', () => {
    const clock = new FakeClock();
    const item = buildItem(clock);
    item.lock('worker-1', clock);
    item.beginProcessing(clock);

    item.resetForRecovery(clock);

    expect(item.state).toBe(QueueItemState.QUEUED);
    expect(item.lockOwner).toBeNull();
  });

  it('fromSnapshot() rehydrates an equivalent item', () => {
    const clock = new FakeClock();
    const item = buildItem(clock);
    item.lock('worker-1', clock);
    item.beginProcessing(clock);
    item.scheduleRetry('blip', clock);

    const rehydrated = QueueItem.fromSnapshot(item.toSnapshot());

    expect(rehydrated.toSnapshot()).toEqual(item.toSnapshot());
  });

  it('toSnapshot() never exposes a live reference to internal history', () => {
    const clock = new FakeClock();
    const item = buildItem(clock);
    const snapshot = item.toSnapshot();
    (snapshot.history as unknown[]).push('corrupted');
    expect(item.toSnapshot().history).toHaveLength(1);
  });
});
