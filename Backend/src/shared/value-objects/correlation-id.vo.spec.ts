import { CorrelationId } from './correlation-id.vo';

describe('CorrelationId', () => {
  it('accepts a well-formed id', () => {
    const result = CorrelationId.create('a1b2c3d4-e5f6-7890');

    expect(result.isSuccess).toBe(true);
    expect(result.value.toString()).toBe('a1b2c3d4-e5f6-7890');
  });

  it('rejects an id that is too short', () => {
    const result = CorrelationId.create('short');
    expect(result.isSuccess).toBe(false);
  });

  it('rejects an id containing invalid characters', () => {
    const result = CorrelationId.create('invalid id with spaces!!');
    expect(result.isSuccess).toBe(false);
  });
});
