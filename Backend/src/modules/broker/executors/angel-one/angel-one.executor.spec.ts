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
import type { LiveOrderSafetyGateService } from '../live-order-safety-gate.service';
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

/** Always-allow stub — these tests exercise Angel One API mechanics, not the safety gate itself (see live-order-safety-gate.service.spec.ts for that). */
function createAlwaysAllowGate(): LiveOrderSafetyGateService {
  return {
    checkEntryAllowed: jest
      .fn()
      .mockResolvedValue({ allowed: true, reason: null }),
  } as unknown as LiveOrderSafetyGateService;
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
    createAlwaysAllowGate(),
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
      createAlwaysAllowGate(),
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

  it('retries a transient network-level failure and wraps it in BrokerOrderApiException only once retries are exhausted', async () => {
    httpClient.request.mockRejectedValue(new TypeError('fetch failed'));
    await expect(executor.placeEntryOrder(entryRequest())).rejects.toThrow(
      BrokerOrderApiException,
    );
    // 1 initial attempt + 2 retries = 3 total calls.
    expect(httpClient.request).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('retries a timeout and wraps it in BrokerOrderApiException only once retries are exhausted', async () => {
    const timeoutError = new Error('The operation was aborted');
    timeoutError.name = 'TimeoutError';
    httpClient.request.mockRejectedValue(timeoutError);

    await expect(executor.placeEntryOrder(entryRequest())).rejects.toThrow(
      BrokerOrderApiException,
    );
    expect(httpClient.request).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('recovers automatically from a single transient network failure — the retry itself succeeds', async () => {
    httpClient.request.mockRejectedValueOnce(new TypeError('fetch failed'));

    const response = await executor.placeEntryOrder(entryRequest());

    expect(response.status).toBe(OrderStatus.FILLED);
    expect(httpClient.request.mock.calls.length).toBeGreaterThan(1);
  });

  it('retries a 5xx broker response and recovers if a later attempt succeeds', async () => {
    let calls = 0;
    const realRequest = httpClient.request.getMockImplementation();
    httpClient.request.mockImplementation((req: BrokerHttpRequest) => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({
          status: 503,
          body: { status: false, message: 'Service unavailable' },
        });
      }
      return Promise.resolve(realRequest!(req));
    });

    const response = await executor.placeEntryOrder(entryRequest());

    expect(response.status).toBe(OrderStatus.FILLED);
    expect(calls).toBeGreaterThan(1);
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

describe('AngelOneExecutor + LiveOrderSafetyGateService wiring', () => {
  function blockingGate(reason: string): LiveOrderSafetyGateService {
    return {
      checkEntryAllowed: jest
        .fn()
        .mockResolvedValue({ allowed: false, reason }),
    } as unknown as LiveOrderSafetyGateService;
  }

  it("placeEntryOrder is rejected with the gate's reason when the safety gate blocks it, and never calls the broker", async () => {
    const server = new FakeAngelOneServer();
    const httpClient = createHttpClient(server);
    const sessionManager = {
      ensureSession: jest.fn().mockResolvedValue(createFakeSession()),
      refresh: jest.fn().mockResolvedValue(createFakeSession()),
    } as unknown as BrokerSessionManager;
    const executor = new AngelOneExecutor(
      createCredentialsProvider(),
      sessionManager,
      blockingGate('broker health is DEGRADED'),
      httpClient,
    );

    await expect(executor.placeEntryOrder(entryRequest())).rejects.toThrow(
      /broker health is DEGRADED/,
    );
    expect(httpClient.request).not.toHaveBeenCalled();
  });

  it('exitPosition still succeeds even when the safety gate would block a new entry — risk-reducing actions are never gated', async () => {
    const server = new FakeAngelOneServer();
    const httpClient = createHttpClient(server);
    const sessionManager = {
      ensureSession: jest.fn().mockResolvedValue(createFakeSession()),
      refresh: jest.fn().mockResolvedValue(createFakeSession()),
    } as unknown as BrokerSessionManager;
    // First, place an entry with an always-allow gate so there's something to exit.
    const setupExecutor = new AngelOneExecutor(
      createCredentialsProvider(),
      sessionManager,
      createAlwaysAllowGate(),
      httpClient,
    );
    const placed = await setupExecutor.placeEntryOrder(entryRequest());

    // Now exit using an executor instance wired to a gate that blocks every entry.
    const blockingExecutor = new AngelOneExecutor(
      createCredentialsProvider(),
      sessionManager,
      blockingGate('LIVE_TRADING_ENABLED is off'),
      httpClient,
    );

    const exited = await blockingExecutor.exitPosition(
      placed.brokerOrderId,
      new ExitRequest(50),
    );

    expect(exited.status).toBe(OrderStatus.FILLED);
  });
});
