import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { LOCK_TIMEOUT_MS } from '../order-queue.constants';

interface LockEntry {
  readonly ownerId: string;
  readonly acquiredAt: Date;
}

/**
 * In-memory, per-key locking (keyed by instrument token in this module) —
 * this is what actually implements the "Lock" step between Queue and
 * Executor in the frozen flow diagram. A lock older than lockTimeoutMs is
 * considered abandoned (a crashed worker, an unhandled exception that never
 * released it) and can be stolen by the next acquirer — this is the
 * "deadlock cleanup" behavior: no lock can ever permanently starve the
 * queue.
 */
@Injectable()
export class LockManager {
  private readonly locks = new Map<string, LockEntry>();

  constructor(
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(LOCK_TIMEOUT_MS) private readonly lockTimeoutMs: number,
  ) {}

  tryAcquire(key: string, ownerId: string): boolean {
    const existing = this.locks.get(key);
    if (existing && !this.isStale(existing)) {
      return false;
    }
    this.locks.set(key, { ownerId, acquiredAt: this.clock.now() });
    return true;
  }

  release(key: string, ownerId: string): void {
    const existing = this.locks.get(key);
    if (existing && existing.ownerId === ownerId) {
      this.locks.delete(key);
    }
  }

  isLocked(key: string): boolean {
    const existing = this.locks.get(key);
    return existing !== undefined && !this.isStale(existing);
  }

  /**
   * Proactively garbage-collects stale entries left behind by an abandoned
   * lock — normally unnecessary (staleness is already checked lazily on the
   * next `tryAcquire`), but keeps the in-memory map from accumulating dead
   * entries for instruments that are never retried. Returns the number
   * removed. Added in Phase 8 for the Scheduler's CleanupJob.
   */
  cleanupStaleLocks(): number {
    let removed = 0;
    for (const [key, entry] of this.locks) {
      if (this.isStale(entry)) {
        this.locks.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  private isStale(entry: LockEntry): boolean {
    const age = this.clock.now().getTime() - entry.acquiredAt.getTime();
    return age >= this.lockTimeoutMs;
  }
}
