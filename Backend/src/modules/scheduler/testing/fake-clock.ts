import type { IClock } from '@shared/clock/clock.interface';

export class FakeClock implements IClock {
  private current: number;

  constructor(startMs = 1_700_000_000_000) {
    this.current = startMs;
  }

  now(): Date {
    this.current += 1;
    return new Date(this.current);
  }

  advanceBy(ms: number): void {
    this.current += ms;
  }
}
