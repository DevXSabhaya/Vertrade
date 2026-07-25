export class Result<T, E = Error> {
  private constructor(
    public readonly isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  static ok<T, E = Error>(value: T): Result<T, E> {
    return new Result<T, E>(true, value, undefined);
  }

  static fail<T, E = Error>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  get isFailure(): boolean {
    return !this.isSuccess;
  }

  get value(): T {
    if (!this.isSuccess) {
      throw new Error('Cannot read the value of a failed Result');
    }
    return this._value as T;
  }

  get error(): E {
    if (this.isSuccess) {
      throw new Error('Cannot read the error of a successful Result');
    }
    return this._error as E;
  }
}
