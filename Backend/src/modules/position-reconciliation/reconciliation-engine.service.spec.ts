import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import { OrderStatus } from '@modules/broker/executors/models/order-status.enum';
import { ReconciliationEngine } from './reconciliation-engine.service';
import type { LocalPositionProvider } from './local-position.provider';
import type { BrokerPositionProvider } from './broker-position.provider';
import { FakeClock } from './testing/fake-clock';
import type { LocalPositionView } from './models/local-position-view.model';

function local(overrides: Partial<LocalPositionView> = {}): LocalPositionView {
  return {
    tradeId: 't1',
    tradingSymbol: 'X',
    exchange: 'NFO',
    instrumentToken: 'T',
    side: TradeDirection.LONG,
    quantity: 50,
    filledQuantity: 50,
    openQuantity: 50,
    averagePrice: 100,
    currentStopLoss: 95,
    targets: [110],
    remainingTargets: [110],
    tradeState: TradeState.ACTIVE,
    entryOrderId: 'E-1',
    exitOrderId: null,
    ...overrides,
  };
}

describe('ReconciliationEngine', () => {
  let localProvider: jest.Mocked<
    Pick<LocalPositionProvider, 'getOpenPositions'>
  >;
  let brokerProvider: jest.Mocked<Pick<BrokerPositionProvider, 'fetch'>>;
  let engine: ReconciliationEngine;

  beforeEach(() => {
    localProvider = { getOpenPositions: jest.fn().mockReturnValue([]) };
    brokerProvider = { fetch: jest.fn() };
    engine = new ReconciliationEngine(
      localProvider as unknown as LocalPositionProvider,
      brokerProvider as unknown as BrokerPositionProvider,
      new FakeClock(),
    );
  });

  it('produces one result per open local position', async () => {
    localProvider.getOpenPositions.mockReturnValue([
      local({ tradeId: 't1' }),
      local({ tradeId: 't2' }),
    ]);
    brokerProvider.fetch.mockResolvedValue({
      tradeId: 't1',
      entryOrderStatus: OrderStatus.FILLED,
      entryFilledQuantity: 50,
      entryAveragePrice: 100,
      exitOrderStatus: null,
      exitFilledQuantity: null,
      exitAveragePrice: null,
    });

    const results = await engine.run();

    expect(results).toHaveLength(2);
  });

  it('crash during reconciliation: a broker lookup failure for one trade never aborts the others', async () => {
    localProvider.getOpenPositions.mockReturnValue([
      local({ tradeId: 't1' }),
      local({ tradeId: 't2' }),
    ]);
    brokerProvider.fetch
      .mockRejectedValueOnce(new Error('broker timeout'))
      .mockResolvedValueOnce({
        tradeId: 't2',
        entryOrderStatus: OrderStatus.FILLED,
        entryFilledQuantity: 50,
        entryAveragePrice: 100,
        exitOrderStatus: null,
        exitFilledQuantity: null,
        exitAveragePrice: null,
      });

    const results = await engine.run();

    expect(results).toHaveLength(1);
    expect(results[0].report.tradeId).toBe('t2');
  });

  it('returns an empty array when there are no open positions', async () => {
    const results = await engine.run();
    expect(results).toEqual([]);
  });
});
