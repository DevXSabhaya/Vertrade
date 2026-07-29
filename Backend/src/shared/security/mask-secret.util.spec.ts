import { maskSecret } from './mask-secret.util';

describe('maskSecret', () => {
  it('reports an empty value as "(empty)"', () => {
    expect(maskSecret('')).toBe('(empty)');
    expect(maskSecret('   ')).toBe('(empty)');
  });

  it('shows only the first 4 characters and the length', () => {
    expect(maskSecret('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')).toBe(
      'GOCS...(35 chars)',
    );
  });

  it('never includes the full secret in its output', () => {
    const secret = 'super-secret-refresh-token-value';
    expect(maskSecret(secret)).not.toContain(secret);
  });

  it('trims surrounding whitespace before measuring length', () => {
    expect(maskSecret('  abcd  ')).toBe('abcd...(4 chars)');
  });
});
