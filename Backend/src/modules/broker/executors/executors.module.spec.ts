import type { IOrderExecutor } from './order-executor.interface';
import { selectOrderExecutor } from './select-order-executor.util';

describe('selectOrderExecutor', () => {
  const paperExecutor = { name: 'paper' } as unknown as IOrderExecutor;
  const angelOneExecutor = { name: 'angel-one' } as unknown as IOrderExecutor;

  it('selects PaperExecutor when TRADING_MODE is PAPER', () => {
    const selected = selectOrderExecutor(
      { tradingMode: 'PAPER' },
      paperExecutor,
      angelOneExecutor,
    );
    expect(selected).toBe(paperExecutor);
  });

  it('selects AngelOneExecutor when TRADING_MODE is LIVE', () => {
    const selected = selectOrderExecutor(
      { tradingMode: 'LIVE' },
      paperExecutor,
      angelOneExecutor,
    );
    expect(selected).toBe(angelOneExecutor);
  });

  it('never falls back to AngelOneExecutor unless LIVE is explicitly set', () => {
    const selected = selectOrderExecutor(
      { tradingMode: 'PAPER' },
      paperExecutor,
      angelOneExecutor,
    );
    expect(selected).not.toBe(angelOneExecutor);
  });
});
