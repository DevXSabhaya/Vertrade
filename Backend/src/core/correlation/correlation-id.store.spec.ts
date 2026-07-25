import { CorrelationIdStore } from './correlation-id.store';

describe('CorrelationIdStore', () => {
  it('returns undefined outside of any run() context', () => {
    expect(CorrelationIdStore.getId()).toBeUndefined();
  });

  it('makes the id available anywhere inside run()', () => {
    CorrelationIdStore.run('test-correlation-id', () => {
      expect(CorrelationIdStore.getId()).toBe('test-correlation-id');
    });
  });

  it('propagates through async operations within the same run()', async () => {
    await CorrelationIdStore.run('async-correlation-id', async () => {
      await Promise.resolve();
      expect(CorrelationIdStore.getId()).toBe('async-correlation-id');
    });
  });

  it('isolates concurrent contexts from each other', async () => {
    const results: string[] = [];

    await Promise.all([
      CorrelationIdStore.run('id-1', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(CorrelationIdStore.getId() ?? 'missing');
      }),
      Promise.resolve(
        CorrelationIdStore.run('id-2', () => {
          results.push(CorrelationIdStore.getId() ?? 'missing');
        }),
      ),
    ]);

    expect(results).toContain('id-1');
    expect(results).toContain('id-2');
  });
});
