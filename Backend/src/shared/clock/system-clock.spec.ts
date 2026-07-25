import { SystemClock } from './system-clock';

describe('SystemClock', () => {
  it('returns a Date close to the real current time', () => {
    const clock = new SystemClock();
    const before = Date.now();
    const result = clock.now();
    const after = Date.now();

    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(after);
  });
});
