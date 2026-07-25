import { NativeTimerScheduler } from './native-timer-scheduler';

describe('NativeTimerScheduler', () => {
  it('invokes the callback after the delay and can be cleared', (done) => {
    const scheduler = new NativeTimerScheduler();
    const callback = jest.fn();

    const handle = scheduler.setTimeout(callback, 10);
    scheduler.clearTimeout(handle);

    setTimeout(() => {
      expect(callback).not.toHaveBeenCalled();
      done();
    }, 30);
  });

  it('invokes an interval callback repeatedly until cleared', (done) => {
    const scheduler = new NativeTimerScheduler();
    const callback = jest.fn();

    const handle = scheduler.setInterval(callback, 10);

    setTimeout(() => {
      scheduler.clearInterval(handle);
      const callsAtClear = callback.mock.calls.length;
      expect(callsAtClear).toBeGreaterThan(0);

      setTimeout(() => {
        expect(callback.mock.calls.length).toBe(callsAtClear);
        done();
      }, 30);
    }, 35);
  });
});
