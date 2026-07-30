import type { IOrderExecutor } from './order-executor.interface';
import { selectOrderExecutor } from './select-order-executor.util';

describe('selectOrderExecutor', () => {
  const paperExecutor = { name: 'paper' } as unknown as IOrderExecutor;
  const dhanExecutor = { name: 'dhan' } as unknown as IOrderExecutor;

  it('selects PaperExecutor when TRADING_MODE is PAPER', () => {
    const selected = selectOrderExecutor(
      { tradingMode: 'PAPER' },
      paperExecutor,
      dhanExecutor,
    );
    expect(selected).toBe(paperExecutor);
  });

  it('selects DhanExecutor when TRADING_MODE is LIVE', () => {
    const selected = selectOrderExecutor(
      { tradingMode: 'LIVE' },
      paperExecutor,
      dhanExecutor,
    );
    expect(selected).toBe(dhanExecutor);
  });

  it('never falls back to DhanExecutor unless LIVE is explicitly set', () => {
    const selected = selectOrderExecutor(
      { tradingMode: 'PAPER' },
      paperExecutor,
      dhanExecutor,
    );
    expect(selected).not.toBe(dhanExecutor);
  });
});
