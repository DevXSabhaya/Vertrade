import { Result } from '../types/result';

const CORRELATION_ID_PATTERN = /^[a-zA-Z0-9-]{8,100}$/;

export class CorrelationId {
  private constructor(private readonly value: string) {}

  static create(value: string): Result<CorrelationId, string> {
    if (!CORRELATION_ID_PATTERN.test(value)) {
      return Result.fail(`"${value}" is not a valid correlation id`);
    }
    return Result.ok(new CorrelationId(value));
  }

  toString(): string {
    return this.value;
  }
}
