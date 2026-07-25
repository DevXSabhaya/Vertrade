import { SubscriptionManager } from './subscription-manager';
import { MarketDataInstrument } from '../models/market-data-instrument.model';

function instrument(token: string): MarketDataInstrument {
  return new MarketDataInstrument('NFO', `SYMBOL-${token}`, token);
}

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager;

  beforeEach(() => {
    manager = new SubscriptionManager();
  });

  it('reports isNewInstrument=true for the first subscriber of an instrument', () => {
    const result = manager.addSubscriber(instrument('T1'), 'sub-1');
    expect(result).toEqual({ isNewInstrument: true, subscriberCount: 1 });
  });

  it('prevents duplicate broker subscribe requests for a second subscriber of the same instrument', () => {
    manager.addSubscriber(instrument('T1'), 'sub-1');
    const result = manager.addSubscriber(instrument('T1'), 'sub-2');

    expect(result).toEqual({ isNewInstrument: false, subscriberCount: 2 });
    expect(manager.getSubscriberCount('T1')).toBe(2);
  });

  it('adding the same subscriber twice is idempotent (a Set, not a counter)', () => {
    manager.addSubscriber(instrument('T1'), 'sub-1');
    manager.addSubscriber(instrument('T1'), 'sub-1');

    expect(manager.getSubscriberCount('T1')).toBe(1);
  });

  it('does not unsubscribe from the broker while another subscriber remains', () => {
    manager.addSubscriber(instrument('T1'), 'sub-1');
    manager.addSubscriber(instrument('T1'), 'sub-2');

    const result = manager.removeSubscriber('T1', 'sub-1');

    expect(result).toEqual({ isFullyUnsubscribed: false, subscriberCount: 1 });
    expect(manager.isSubscribed('T1')).toBe(true);
  });

  it('automatically cleans up and signals unsubscribe once the last subscriber leaves', () => {
    manager.addSubscriber(instrument('T1'), 'sub-1');
    const result = manager.removeSubscriber('T1', 'sub-1');

    expect(result).toEqual({ isFullyUnsubscribed: true, subscriberCount: 0 });
    expect(manager.isSubscribed('T1')).toBe(false);
    expect(manager.getInstrument('T1')).toBeUndefined();
  });

  it('removing an unknown subscriber/instrument is a safe no-op', () => {
    const result = manager.removeSubscriber('UNKNOWN', 'sub-1');
    expect(result).toEqual({ isFullyUnsubscribed: false, subscriberCount: 0 });
  });

  it('tracks multiple distinct instruments independently', () => {
    manager.addSubscriber(instrument('T1'), 'sub-1');
    manager.addSubscriber(instrument('T2'), 'sub-1');

    expect(manager.count()).toBe(2);
    expect(
      manager
        .getSubscribedInstruments()
        .map((i) => i.instrumentToken)
        .sort(),
    ).toEqual(['T1', 'T2']);
  });

  it('supports many subscribers unsubscribing one at a time down to zero', () => {
    manager.addSubscriber(instrument('T1'), 'a');
    manager.addSubscriber(instrument('T1'), 'b');
    manager.addSubscriber(instrument('T1'), 'c');

    expect(manager.removeSubscriber('T1', 'a').isFullyUnsubscribed).toBe(false);
    expect(manager.removeSubscriber('T1', 'b').isFullyUnsubscribed).toBe(false);
    expect(manager.removeSubscriber('T1', 'c').isFullyUnsubscribed).toBe(true);
  });
});
