import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import type { IOrderExecutor } from '@modules/broker/executors/order-executor.interface';
import { OrderResponse } from '@modules/broker/executors/models/order-response.model';
import { OrderStatus } from '@modules/broker/executors/models/order-status.enum';
import { BrokerPositionProvider } from './broker-position.provider';
import type { LocalPositionView } from './models/local-position-view.model';

function local(overrides: Partial<LocalPositionView> = {}): LocalPositionView {
  return {
    tradeId: 't1',
    tradingSymbol: 'NIFTY24500CE',
    exchange: 'NFO',
    instrumentToken: 'TOKEN-1',
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
    brokerAccountId: null,
    ...overrides,
  };
}

describe('BrokerPositionProvider', () => {
  let orderExecutor: jest.Mocked<Pick<IOrderExecutor, 'getOrderStatus'>>;
  let provider: BrokerPositionProvider;

  beforeEach(() => {
    orderExecutor = { getOrderStatus: jest.fn() };
    provider = new BrokerPositionProvider(
      orderExecutor as unknown as IOrderExecutor,
    );
  });

  it('queries the entry order status when an entry order id exists', async () => {
    orderExecutor.getOrderStatus.mockResolvedValue(
      new OrderResponse('E-1', OrderStatus.FILLED, 50, 100, new Date()),
    );

    const view = await provider.fetch(local());

    expect(orderExecutor.getOrderStatus).toHaveBeenCalledWith('E-1', null);
    expect(view.entryOrderStatus).toBe(OrderStatus.FILLED);
    expect(view.entryFilledQuantity).toBe(50);
    expect(view.entryAveragePrice).toBe(100);
  });

  it('never queries an order id that does not exist locally', async () => {
    await provider.fetch(local({ entryOrderId: null, exitOrderId: null }));
    expect(orderExecutor.getOrderStatus).not.toHaveBeenCalled();
  });

  it('queries both entry and exit order status when both exist', async () => {
    orderExecutor.getOrderStatus
      .mockResolvedValueOnce(
        new OrderResponse('E-1', OrderStatus.FILLED, 50, 100, new Date()),
      )
      .mockResolvedValueOnce(
        new OrderResponse('X-1', OrderStatus.FILLED, 50, 110, new Date()),
      );

    const view = await provider.fetch(local({ exitOrderId: 'X-1' }));

    expect(view.exitOrderStatus).toBe(OrderStatus.FILLED);
    expect(view.exitAveragePrice).toBe(110);
  });
});
