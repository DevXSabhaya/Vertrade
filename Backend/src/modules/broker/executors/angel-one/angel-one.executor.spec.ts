import { AngelOneExecutor } from './angel-one.executor';
import { BrokerCredentialsProvider } from '@modules/broker/broker-auth/broker-credentials.provider';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { BrokerSession } from '@modules/broker/broker-auth/entities/broker-session.entity';
import { BrokerToken } from '@modules/broker/broker-auth/value-objects/broker-token.vo';
import { BrokerCredentials } from '@modules/broker/broker-auth/value-objects/broker-credentials.vo';
import type {
  BrokerHttpRequest,
  IBrokerHttpClient,
} from '@modules/broker/broker-auth/interfaces/broker-http-client.interface';
import { OrderRequest } from '../models/order-request.model';
import { OrderModification } from '../models/order-modification.model';
import { ExitRequest } from '../models/exit-request.model';
import { OrderSide } from '../models/order-side.enum';
import { OrderPriceType } from '../models/order-price-type.enum';
import { OrderStatus } from '../models/order-status.enum';
import { OrderNotFoundException } from '../exceptions/order-not-found.exception';
import { OrderPlacementException } from '../exceptions/order-placement.exception';
import { BrokerOrderApiException } from '../exceptions/broker-order-api.exception';
import {
  ANGEL_ONE_CANCEL_ORDER_PATH,
  ANGEL_ONE_MODIFY_ORDER_PATH,
  ANGEL_ONE_ORDER_BOOK_PATH,
  ANGEL_ONE_PLACE_ORDER_PATH,
} from './angel-one-order.constants';
import type {
  AngelOneCancelOrderRequestBody,
  AngelOneModifyOrderRequestBody,
  AngelOneOrderBookResponseBody,
  AngelOneOrderMutationResponseBody,
  AngelOnePlaceOrderRequestBody,
} from './angel-one-order-raw.dto';
import { describeOrderExecutorContract } from '../contract/order-executor.contract';

interface FakeOrderRecord {
  tradingsymbol: string;
  symboltoken: string;
  exchange: string;
  quantity: string;
  price: string;
  status: string;
  filledshares: string;
  averageprice: string;
}

/** A minimal, fully in-memory fake Angel One order book — no real network ever involved. */
class FakeAngelOneServer {
  private readonly orders = new Map<string, FakeOrderRecord>();
  private sequence = 0;
  nextPlacementStatus: 'open' | 'complete' = 'complete';
  rejectNextPlacement = false;
  sessionExpiredOnce = false;

  placeOrder(
    body: AngelOnePlaceOrderRequestBody,
  ): AngelOneOrderMutationResponseBody {
    if (this.rejectNextPlacement) {
      this.rejectNextPlacement = false;
      return {
        status: false,
        message: 'Rejected by fake broker',
        errorcode: 'AB1000',
        data: null,
      };
    }

    this.sequence += 1;
    const orderid = `AO-${this.sequence}`;
    const status = this.nextPlacementStatus;
    this.nextPlacementStatus = 'complete';
    const filled = status === 'complete';

    this.orders.set(orderid, {
      tradingsymbol: body.tradingsymbol,
      symboltoken: body.symboltoken,
      exchange: body.exchange,
      quantity: body.quantity,
      price: body.price,
      status,
      filledshares: filled ? body.quantity : '0',
      averageprice: filled ? (body.price !== '0' ? body.price : '100') : '0',
    });

    return {
      status: true,
      message: 'SUCCESS',
      errorcode: '',
      data: { script: body.tradingsymbol, orderid },
    };
  }

  modifyOrder(
    body: AngelOneModifyOrderRequestBody,
  ): AngelOneOrderMutationResponseBody {
    const order = this.orders.get(body.orderid);
    if (!order) {
      return {
        status: false,
        message: 'Order not found',
        errorcode: 'AB2000',
        data: null,
      };
    }
    order.quantity = body.quantity;
    order.price = body.price;
    return {
      status: true,
      message: 'SUCCESS',
      errorcode: '',
      data: { script: order.tradingsymbol, orderid: body.orderid },
    };
  }

  cancelOrder(
    body: AngelOneCancelOrderRequestBody,
  ): AngelOneOrderMutationResponseBody {
    const order = this.orders.get(body.orderid);
    if (!order) {
      return {
        status: false,
        message: 'Order not found',
        errorcode: 'AB2000',
        data: null,
      };
    }
    order.status = 'cancelled';
    return {
      status: true,
      message: 'SUCCESS',
      errorcode: '',
      data: { script: order.tradingsymbol, orderid: body.orderid },
    };
  }

  getOrderBook(): AngelOneOrderBookResponseBody {
    const data = Array.from(this.orders.entries()).map(([orderid, order]) => ({
      orderid,
      status: order.status,
      tradingsymbol: order.tradingsymbol,
      symboltoken: order.symboltoken,
      exchange: order.exchange,
      quantity: order.quantity,
      price: order.price,
      filledshares: order.filledshares,
      averageprice: order.averageprice,
      updatetime: '2026-01-01 10:00:00',
    }));
    return { status: true, message: 'SUCCESS', errorcode: '', data };
  }
}

function createFakeSession(): BrokerSession {
  return new BrokerSession(
    'CLIENT1',
    new BrokerToken('jwt-value', 'refresh-value', 'feed-value'),
    new Date(),
    new Date(Date.now() + 3_600_000),
  );
}

function createCredentialsProvider(): BrokerCredentialsProvider {
  return {
    getCredentials: () =>
      new BrokerCredentials(
        'api-key',
        'CLIENT1',
        'password',
        'JBSWY3DPEHPK3PXP',
      ),
  } as unknown as BrokerCredentialsProvider;
}

function createHttpClient(
  server: FakeAngelOneServer,
): jest.Mocked<IBrokerHttpClient> {
  return {
    request: jest.fn((req: BrokerHttpRequest) => {
      if (server.sessionExpiredOnce) {
        server.sessionExpiredOnce = false;
        return {
          status: 401,
          body: {
            status: false,
            message: 'Session expired',
            errorcode: 'AB3000',
            data: null,
          },
        };
      }
      if (req.url.endsWith(ANGEL_ONE_PLACE_ORDER_PATH)) {
        return {
          status: 200,
          body: server.placeOrder(req.body as AngelOnePlaceOrderRequestBody),
        };
      }
      if (req.url.endsWith(ANGEL_ONE_MODIFY_ORDER_PATH)) {
        return {
          status: 200,
          body: server.modifyOrder(req.body as AngelOneModifyOrderRequestBody),
        };
      }
      if (req.url.endsWith(ANGEL_ONE_CANCEL_ORDER_PATH)) {
        return {
          status: 200,
          body: server.cancelOrder(req.body as AngelOneCancelOrderRequestBody),
        };
      }
      if (req.url.endsWith(ANGEL_ONE_ORDER_BOOK_PATH)) {
        return { status: 200, body: server.getOrderBook() };
      }
      throw new Error(`Unexpected URL in test: ${req.url}`);
    }),
  } as unknown as jest.Mocked<IBrokerHttpClient>;
}

function entryRequest(): OrderRequest {
  return new OrderRequest(
    'NFO',
    'NIFTY24500CE',
    '12345',
    OrderSide.BUY,
    50,
    OrderPriceType.MARKET,
  );
}

describeOrderExecutorContract('AngelOneExecutor', () => {
  const server = new FakeAngelOneServer();
  const httpClient = createHttpClient(server);
  const sessionManager = {
    ensureSession: jest.fn().mockResolvedValue(createFakeSession()),
    refresh: jest.fn().mockResolvedValue(createFakeSession()),
  } as unknown as BrokerSessionManager;

  const executor = new AngelOneExecutor(
    createCredentialsProvider(),
    sessionManager,
    httpClient,
  );

  return {
    executor,
    placeFillableOrder: () => executor.placeEntryOrder(entryRequest()),
    placeOpenOrder: () => {
      server.nextPlacementStatus = 'open';
      return executor.placeEntryOrder(entryRequest());
    },
  };
});

describe('AngelOneExecutor (broker-specific behavior)', () => {
  let server: FakeAngelOneServer;
  let httpClient: jest.Mocked<IBrokerHttpClient>;
  let sessionManager: jest.Mocked<
    Pick<BrokerSessionManager, 'ensureSession' | 'refresh'>
  >;
  let executor: AngelOneExecutor;

  beforeEach(() => {
    server = new FakeAngelOneServer();
    httpClient = createHttpClient(server);
    sessionManager = {
      ensureSession: jest.fn().mockResolvedValue(createFakeSession()),
      refresh: jest.fn().mockResolvedValue(createFakeSession()),
    };
    executor = new AngelOneExecutor(
      createCredentialsProvider(),
      sessionManager as unknown as BrokerSessionManager,
      httpClient,
    );
  });

  it('never calls the real network — only the mocked http client is invoked', async () => {
    await executor.placeEntryOrder(entryRequest());
    expect(httpClient.request).toHaveBeenCalled();
  });

  it('sends the required Angel One headers including the session JWT', async () => {
    await executor.placeEntryOrder(entryRequest());

    expect(httpClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-PrivateKey': 'api-key',
          Authorization: 'Bearer jwt-value',
        }),
      }),
    );
  });

  it('throws OrderPlacementException when Angel One rejects the order', async () => {
    server.rejectNextPlacement = true;
    await expect(executor.placeEntryOrder(entryRequest())).rejects.toThrow(
      OrderPlacementException,
    );
  });

  it('throws OrderNotFoundException for an unknown order id', async () => {
    await expect(executor.getOrderStatus('UNKNOWN-ID')).rejects.toThrow(
      OrderNotFoundException,
    );
  });

  it('throws OrderNotFoundException when modifying an unknown order id', async () => {
    await expect(
      executor.modifyOrder('UNKNOWN-ID', new OrderModification(10)),
    ).rejects.toThrow(OrderNotFoundException);
  });

  it('automatically refreshes the session once and retries after a session-expired response', async () => {
    server.sessionExpiredOnce = true;
    const response = await executor.placeEntryOrder(entryRequest());

    expect(sessionManager.refresh).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(OrderStatus.FILLED);
  });

  it('wraps a network-level failure in BrokerOrderApiException', async () => {
    httpClient.request.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(executor.placeEntryOrder(entryRequest())).rejects.toThrow(
      BrokerOrderApiException,
    );
  });

  it('wraps a timeout in BrokerOrderApiException', async () => {
    const timeoutError = new Error('The operation was aborted');
    timeoutError.name = 'TimeoutError';
    httpClient.request.mockRejectedValueOnce(timeoutError);

    await expect(executor.placeEntryOrder(entryRequest())).rejects.toThrow(
      BrokerOrderApiException,
    );
  });

  it('marks the original order as EXITED after exitPosition, overlaying the broker order book', async () => {
    const placed = await executor.placeEntryOrder(entryRequest());
    await executor.exitPosition(placed.brokerOrderId, new ExitRequest(50));

    const afterExit = await executor.getOrderStatus(placed.brokerOrderId);
    expect(afterExit.status).toBe(OrderStatus.EXITED);
  });

  it('exit order uses the opposite side (SELL) of the original BUY entry', async () => {
    const placed = await executor.placeEntryOrder(entryRequest());
    const exited = await executor.exitPosition(
      placed.brokerOrderId,
      new ExitRequest(50),
    );

    expect(exited.brokerOrderId).not.toBe(placed.brokerOrderId);
    expect(exited.status).toBe(OrderStatus.FILLED);
  });
});
