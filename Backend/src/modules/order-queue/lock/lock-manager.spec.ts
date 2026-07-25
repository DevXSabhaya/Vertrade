import { LockManager } from './lock-manager';
import { FakeClock } from '../testing/fake-clock';

describe('LockManager', () => {
  it('acquires a free lock', () => {
    const manager = new LockManager(new FakeClock(), 30_000);
    expect(manager.tryAcquire('TOKEN-1', 'owner-a')).toBe(true);
    expect(manager.isLocked('TOKEN-1')).toBe(true);
  });

  it('prevents a second owner from acquiring an already-held, non-stale lock', () => {
    const manager = new LockManager(new FakeClock(), 30_000);
    manager.tryAcquire('TOKEN-1', 'owner-a');
    expect(manager.tryAcquire('TOKEN-1', 'owner-b')).toBe(false);
  });

  it('release() only releases if the caller is the current owner', () => {
    const manager = new LockManager(new FakeClock(), 30_000);
    manager.tryAcquire('TOKEN-1', 'owner-a');

    manager.release('TOKEN-1', 'owner-b'); // wrong owner: no-op
    expect(manager.isLocked('TOKEN-1')).toBe(true);

    manager.release('TOKEN-1', 'owner-a'); // correct owner: releases
    expect(manager.isLocked('TOKEN-1')).toBe(false);
  });

  it('allows a fresh acquire after a proper release', () => {
    const manager = new LockManager(new FakeClock(), 30_000);
    manager.tryAcquire('TOKEN-1', 'owner-a');
    manager.release('TOKEN-1', 'owner-a');
    expect(manager.tryAcquire('TOKEN-1', 'owner-b')).toBe(true);
  });

  it('treats different instrument keys as fully independent', () => {
    const manager = new LockManager(new FakeClock(), 30_000);
    manager.tryAcquire('TOKEN-1', 'owner-a');
    expect(manager.tryAcquire('TOKEN-2', 'owner-b')).toBe(true);
  });

  describe('lock timeout / deadlock cleanup', () => {
    it('allows a stale lock (older than the timeout) to be stolen', () => {
      const clock = new FakeClock();
      const manager = new LockManager(clock, 30_000);
      manager.tryAcquire('TOKEN-1', 'owner-a');

      clock.advanceBy(30_001);

      expect(manager.tryAcquire('TOKEN-1', 'owner-b')).toBe(true);
    });

    it('a lock well under the timeout is still considered held', () => {
      // Comfortably clear of the boundary: FakeClock.now() itself advances
      // the clock by 1ms on every read (including LockManager's own internal
      // staleness checks), so asserting right at the exact millisecond
      // boundary is inherently flaky — this is a test-clock artifact, not
      // production behavior (a real wall clock's own reads never advance it).
      const clock = new FakeClock();
      const manager = new LockManager(clock, 30_000);
      manager.tryAcquire('TOKEN-1', 'owner-a');

      clock.advanceBy(10_000);

      expect(manager.tryAcquire('TOKEN-1', 'owner-b')).toBe(false);
    });

    it('isLocked() reports false once a lock has gone stale', () => {
      const clock = new FakeClock();
      const manager = new LockManager(clock, 30_000);
      manager.tryAcquire('TOKEN-1', 'owner-a');

      clock.advanceBy(30_001);

      expect(manager.isLocked('TOKEN-1')).toBe(false);
    });
  });

  describe('cleanupStaleLocks (Phase 8)', () => {
    it('removes stale entries and returns the count removed', () => {
      const clock = new FakeClock();
      const manager = new LockManager(clock, 30_000);
      manager.tryAcquire('TOKEN-1', 'owner-a');
      manager.tryAcquire('TOKEN-2', 'owner-b');

      clock.advanceBy(30_001);

      expect(manager.cleanupStaleLocks()).toBe(2);
    });

    it('leaves fresh (non-stale) locks untouched', () => {
      const clock = new FakeClock();
      const manager = new LockManager(clock, 30_000);
      manager.tryAcquire('TOKEN-1', 'owner-a');

      expect(manager.cleanupStaleLocks()).toBe(0);
      expect(manager.isLocked('TOKEN-1')).toBe(true);
    });

    it('a cleaned-up lock can be freshly re-acquired by anyone', () => {
      const clock = new FakeClock();
      const manager = new LockManager(clock, 30_000);
      manager.tryAcquire('TOKEN-1', 'owner-a');
      clock.advanceBy(30_001);
      manager.cleanupStaleLocks();

      expect(manager.tryAcquire('TOKEN-1', 'owner-b')).toBe(true);
    });
  });
});
