import { withTimeout } from './with-timeout.util';

describe('withTimeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the operation result when it settles before the deadline', async () => {
    await expect(
      withTimeout(Promise.resolve('done'), 1_000, 'op'),
    ).resolves.toBe('done');
  });

  it('rejects with the operation error when it rejects before the deadline', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('boom')), 1_000, 'op'),
    ).rejects.toThrow('boom');
  });

  it('wraps a non-Error rejection reason in an Error', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberately exercising a non-Error rejection, which is exactly what withTimeout must normalize
    const rejection = Promise.reject('string reason');
    await expect(withTimeout(rejection, 1_000, 'op')).rejects.toThrow(
      'string reason',
    );
  });

  it('rejects with a timeout error once the deadline elapses, without waiting for the operation', async () => {
    jest.useFakeTimers();
    const neverSettles = new Promise(() => {});

    const pending = withTimeout(neverSettles, 5_000, 'slow op');
    const assertion = expect(pending).rejects.toThrow(
      'slow op timed out after 5000ms',
    );
    await jest.advanceTimersByTimeAsync(5_000);
    await assertion;
  });
});
