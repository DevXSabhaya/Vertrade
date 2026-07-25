import { Result } from './result';

describe('Result', () => {
  it('creates a successful result carrying a value', () => {
    const result = Result.ok<number>(42);

    expect(result.isSuccess).toBe(true);
    expect(result.isFailure).toBe(false);
    expect(result.value).toBe(42);
  });

  it('creates a failed result carrying an error', () => {
    const result = Result.fail<number, string>('boom');

    expect(result.isSuccess).toBe(false);
    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('boom');
  });

  it('throws when reading the value of a failed result', () => {
    const result = Result.fail<number, string>('boom');
    expect(() => result.value).toThrow();
  });

  it('throws when reading the error of a successful result', () => {
    const result = Result.ok<number>(1);
    expect(() => result.error).toThrow();
  });
});
