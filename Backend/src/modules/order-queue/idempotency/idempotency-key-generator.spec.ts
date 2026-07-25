import { IdempotencyKeyGenerator } from './idempotency-key-generator';

function baseInput(
  overrides: Partial<
    Parameters<typeof IdempotencyKeyGenerator.generate>[0]
  > = {},
) {
  return {
    instrumentToken: 'TOKEN-1',
    orderType: 'CREATE_TRADE',
    direction: 'LONG',
    quantity: 50,
    entryTriggerPrice: 100,
    now: new Date('2026-01-05T05:00:00.000Z'),
    ...overrides,
  };
}

describe('IdempotencyKeyGenerator', () => {
  it('uses the explicit key verbatim (prefixed) when supplied', () => {
    const key = IdempotencyKeyGenerator.generate(
      baseInput({ explicitKey: 'click-123' }),
    );
    expect(key).toBe('explicit:click-123');
  });

  it('trims the explicit key', () => {
    const key = IdempotencyKeyGenerator.generate(
      baseInput({ explicitKey: '  click-123  ' }),
    );
    expect(key).toBe('explicit:click-123');
  });

  it('derives a stable key for identical requests within the same time bucket', () => {
    const a = IdempotencyKeyGenerator.generate(
      baseInput({ now: new Date('2026-01-05T05:00:00.000Z') }),
    );
    const b = IdempotencyKeyGenerator.generate(
      baseInput({ now: new Date('2026-01-05T05:00:00.500Z') }),
    );
    expect(a).toBe(b);
  });

  it('derives different keys for requests in different time buckets', () => {
    const a = IdempotencyKeyGenerator.generate(
      baseInput({ now: new Date('2026-01-05T05:00:00.000Z') }),
      3000,
    );
    const b = IdempotencyKeyGenerator.generate(
      baseInput({ now: new Date('2026-01-05T05:00:10.000Z') }),
      3000,
    );
    expect(a).not.toBe(b);
  });

  it('derives different keys for different instruments', () => {
    const a = IdempotencyKeyGenerator.generate(
      baseInput({ instrumentToken: 'TOKEN-1' }),
    );
    const b = IdempotencyKeyGenerator.generate(
      baseInput({ instrumentToken: 'TOKEN-2' }),
    );
    expect(a).not.toBe(b);
  });

  it('derives different keys for different quantities', () => {
    const a = IdempotencyKeyGenerator.generate(baseInput({ quantity: 50 }));
    const b = IdempotencyKeyGenerator.generate(baseInput({ quantity: 100 }));
    expect(a).not.toBe(b);
  });

  it('is deterministic: identical input always yields identical output', () => {
    const input = baseInput();
    expect(IdempotencyKeyGenerator.generate(input)).toBe(
      IdempotencyKeyGenerator.generate(input),
    );
  });

  it('falls back to a derived key when the explicit key is blank', () => {
    const key = IdempotencyKeyGenerator.generate(
      baseInput({ explicitKey: '   ' }),
    );
    expect(key.startsWith('derived:')).toBe(true);
  });
});
