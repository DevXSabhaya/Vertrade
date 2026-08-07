import { DhanExecutor } from './dhan.executor';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { BrokerSession } from '@modules/broker/broker-auth/entities/broker-session.entity';
import { BrokerToken } from '@modules/broker/broker-auth/value-objects/broker-token.vo';
import type { IBrokerAccountRepository } from '@modules/broker/broker-account/repository/broker-account-repository.interface';
import type { ConfigService } from '@core/config/config.service';
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
import { DHAN_ORDERS_PATH } from './dhan-order.constants';
import type {
  DhanModifyOrderRequestBody,
  DhanPlaceOrderRequestBody,
} from './dhan-order-raw.dto';
import { describeOrderExecutorContract } from '../contract/order-executor.contract';

interface FakeOrderRecord {
  tradingSymbol: string;
  securityId: string;
  exchangeSegment: string;
  quantity: number;
  price: number;
  status: string;
  filledQty: number;
  averageTradedPrice: number;
}

const REST_BASE_URL = 'https://api.dhan.invalid/v2';
const TEST_ACCOUNT_ID = 'acc-1';

/** A minimal, fully in-memory fake Dhan order book — no real network ever involved. */
class FakeDhanServer {
  private readonly orders = new Map<string, FakeOrderRecord>();
  private sequence = 0;
  nextPlacementStatus: 'TRANSIT' | 'TRADED' = 'TRADED';
  rejectNextPlacement = false;
  sessionExpiredOnce = false;

  placeOrder(body: DhanPlaceOrderRequestBody) {
    if (this.rejectNextPlacement) {
      this.rejectNextPlacement = false;
      this.sequence += 1;
      const orderId = `DH-${this.sequence}`;
      this.orders.set(orderId, {
        tradingSymbol: 'REJECTED',
        securityId: body.securityId,
        exchangeSegment: body.exchangeSegment,
        quantity: body.quantity,
        price: body.price,
        status: 'REJECTED',
        filledQty: 0,
        averageTradedPrice: 0,
      });
      return { orderId, orderStatus: 'REJECTED' };
    }

    this.sequence += 1;
    const orderId = `DH-${this.sequence}`;
    const status = this.nextPlacementStatus;
    this.nextPlacementStatus = 'TRADED';
    const filled = status === 'TRADED';

    this.orders.set(orderId, {
      tradingSymbol: 'NIFTY24500CE',
      securityId: body.securityId,
      exchangeSegment: body.exchangeSegment,
      quantity: body.quantity,
      price: body.price,
      status,
      filledQty: filled ? body.quantity : 0,
      averageTradedPrice: filled ? (body.price !== 0 ? body.price : 100) : 0,
    });

    return { orderId, orderStatus: status };
  }

  modifyOrder(orderId: string, body: DhanModifyOrderRequestBody) {
    const order = this.orders.get(orderId);
    if (!order) {
      return { orderId, orderStatus: 'REJECTED' };
    }
    order.quantity = body.quantity;
    order.price = body.price;
    return { orderId, orderStatus: order.status };
  }

  cancelOrder(orderId: string) {
    const order = this.orders.get(orderId);
    if (!order) {
      return { orderId, orderStatus: 'REJECTED' };
    }
    order.status = 'CANCELLED';
    return { orderId, orderStatus: 'CANCELLED' };
  }

  getOrderBook() {
    return Array.from(this.orders.entries()).map(([orderId, order]) => ({
      orderId,
      orderStatus: order.status,
      tradingSymbol: order.tradingSymbol,
      securityId: order.securityId,
      exchangeSegment: order.exchangeSegment,
      quantity: order.quantity,
      price: order.price,
      filledQty: order.filledQty,
      averageTradedPrice: order.averageTradedPrice,
      updateTime: '2026-01-01 10:00:00',
    }));
  }
}

function createFakeSession(): BrokerSession {
  return new BrokerSession(
    'CLIENT1',
    new BrokerToken('access-token-value'),
    new Date(),
    new Date(Date.now() + 3_600_000),
  );
}

function createBrokerAccountRepository(): jest.Mocked<IBrokerAccountRepository> {
  return {
    create: jest.fn(),
    findAllByUser: jest.fn(),
    findById: jest.fn(),
    getCredentials: jest.fn(),
    getCredentialsByAccountId: jest.fn().mockResolvedValue({
      clientId: 'CLIENT1',
      accessToken: 'access-token-value',
    }),
    markActive: jest.fn(),
    recordConnectionOutcome: jest.fn(),
    delete: jest.fn(),
  };
}

function createConfigService(): ConfigService {
  return { dhanRestUrl: REST_BASE_URL } as unknown as ConfigService;
}

function createHttpClient(
  server: FakeDhanServer,
): jest.Mocked<IBrokerHttpClient> {
  return {
    request: jest.fn((req: BrokerHttpRequest) => {
      if (server.sessionExpiredOnce) {
        server.sessionExpiredOnce = false;
        return {
          status: 401,
          body: { errorCode: 'DH-901', errorMessage: 'Invalid Access Token' },
        };
      }

      const ordersUrl = `${REST_BASE_URL}${DHAN_ORDERS_PATH}`;
      if (req.url === ordersUrl && req.method === 'POST') {
        return {
          status: 200,
          body: server.placeOrder(req.body as DhanPlaceOrderRequestBody),
        };
      }
      if (req.url === ordersUrl && req.method === 'GET') {
        return { status: 200, body: server.getOrderBook() };
      }
      if (req.url.startsWith(`${ordersUrl}/`) && req.method === 'PUT') {
        const orderId = req.url.slice(`${ordersUrl}/`.length);
        return {
          status: 200,
          body: server.modifyOrder(
            orderId,
            req.body as DhanModifyOrderRequestBody,
          ),
        };
      }
      if (req.url.startsWith(`${ordersUrl}/`) && req.method === 'DELETE') {
        const orderId = req.url.slice(`${ordersUrl}/`.length);
        return { status: 200, body: server.cancelOrder(orderId) };
      }
      throw new Error(`Unexpected URL in test: ${req.method} ${req.url}`);
    }),
  } as unknown as jest.Mocked<IBrokerHttpClient>;
}

function entryRequest(): OrderRequest {
  return new OrderRequest(
    'NSE_FNO',
    'NIFTY24500CE',
    '12345',
    OrderSide.BUY,
    50,
    OrderPriceType.MARKET,
  );
}

/** Always-allow stub — these tests exercise Dhan API mechanics, not the safety gate itself (see live-order-safety-gate.service.spec.ts for that). */
function createAlwaysAllowGate(): LiveOrderSafetyGateService {
  return {
    checkEntryAllowed: jest
      .fn()
      .mockResolvedValue({ allowed: true, reason: null }),
  } as unknown as LiveOrderSafetyGateService;
}

describeOrderExecutorContract('DhanExecutor', () => {
  const server = new FakeDhanServer();
  const httpClient = createHttpClient(server);
  const sessionManager = {
    ensureSession: jest.fn().mockResolvedValue(createFakeSession()),
    refresh: jest.fn().mockResolvedValue(createFakeSession()),
  } as unknown as BrokerSessionManager;

  const executor = new DhanExecutor(
    createBrokerAccountRepository(),
    sessionManager,
    createAlwaysAllowGate(),
    createConfigService(),
    httpClient,
  );

  return {
    executor,
    accountId: TEST_ACCOUNT_ID,
    placeFillableOrder: () =>
      executor.placeEntryOrder(entryRequest(), TEST_ACCOUNT_ID),
    placeOpenOrder: () => {
      server.nextPlacementStatus = 'TRANSIT';
      return executor.placeEntryOrder(entryRequest(), TEST_ACCOUNT_ID);
    },
  };
});

describe('DhanExecutor (broker-specific behavior)', () => {
  let server: FakeDhanServer;
  let httpClient: jest.Mocked<IBrokerHttpClient>;
  let sessionManager: jest.Mocked<
    Pick<BrokerSessionManager, 'ensureSession' | 'refresh'>
  >;
  let executor: DhanExecutor;

  beforeEach(() => {
    server = new FakeDhanServer();
    httpClient = createHttpClient(server);
    sessionManager = {
      ensureSession: jest.fn().mockResolvedValue(createFakeSession()),
      refresh: jest.fn().mockResolvedValue(createFakeSession()),
    };
    executor = new DhanExecutor(
      createBrokerAccountRepository(),
      sessionManager as unknown as BrokerSessionManager,
      createAlwaysAllowGate(),
      createConfigService(),
      httpClient,
    );
  });

  it('never calls the real network — only the mocked http client is invoked', async () => {
    await executor.placeEntryOrder(entryRequest(), TEST_ACCOUNT_ID);
    expect(httpClient.request).toHaveBeenCalled();
  });

  it('sends the required Dhan headers including the session access token', async () => {
    await executor.placeEntryOrder(entryRequest(), TEST_ACCOUNT_ID);

    expect(httpClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'access-token': 'access-token-value',
        }),
      }),
    );
  });

  it('throws OrderPlacementException when Dhan rejects the order', async () => {
    server.rejectNextPlacement = true;
    await expect(
      executor.placeEntryOrder(entryRequest(), TEST_ACCOUNT_ID),
    ).rejects.toThrow(OrderPlacementException);
  });

  it('throws OrderNotFoundException for an unknown order id', async () => {
    await expect(
      executor.getOrderStatus('UNKNOWN-ID', TEST_ACCOUNT_ID),
    ).rejects.toThrow(OrderNotFoundException);
  });

  it('throws OrderNotFoundException when modifying an unknown order id', async () => {
    await expect(
      executor.modifyOrder(
        'UNKNOWN-ID',
        new OrderModification(10),
        TEST_ACCOUNT_ID,
      ),
    ).rejects.toThrow(OrderNotFoundException);
  });

  it('automatically refreshes the session once and retries after a session-expired response', async () => {
    server.sessionExpiredOnce = true;
    const response = await executor.placeEntryOrder(
      entryRequest(),
      TEST_ACCOUNT_ID,
    );

    expect(sessionManager.refresh).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(OrderStatus.FILLED);
  });

  it('retries a transient network-level failure and wraps it in BrokerOrderApiException only once retries are exhausted', async () => {
    httpClient.request.mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      executor.placeEntryOrder(entryRequest(), TEST_ACCOUNT_ID),
    ).rejects.toThrow(BrokerOrderApiException);
    // 1 initial attempt + 2 retries = 3 total calls.
    expect(httpClient.request).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('retries a timeout and wraps it in BrokerOrderApiException only once retries are exhausted', async () => {
    const timeoutError = new Error('The operation was aborted');
    timeoutError.name = 'TimeoutError';
    httpClient.request.mockRejectedValue(timeoutError);

    await expect(
      executor.placeEntryOrder(entryRequest(), TEST_ACCOUNT_ID),
    ).rejects.toThrow(BrokerOrderApiException);
    expect(httpClient.request).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('recovers automatically from a single transient network failure — the retry itself succeeds', async () => {
    httpClient.request.mockRejectedValueOnce(new TypeError('fetch failed'));

    const response = await executor.placeEntryOrder(
      entryRequest(),
      TEST_ACCOUNT_ID,
    );

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
          body: { errorCode: 'DH-500', errorMessage: 'Service unavailable' },
        });
      }
      return Promise.resolve(realRequest!(req));
    });

    const response = await executor.placeEntryOrder(
      entryRequest(),
      TEST_ACCOUNT_ID,
    );

    expect(response.status).toBe(OrderStatus.FILLED);
    expect(calls).toBeGreaterThan(1);
  });

  it('marks the original order as EXITED after exitPosition, overlaying the broker order book', async () => {
    const placed = await executor.placeEntryOrder(
      entryRequest(),
      TEST_ACCOUNT_ID,
    );
    await executor.exitPosition(
      placed.brokerOrderId,
      new ExitRequest(50),
      TEST_ACCOUNT_ID,
    );

    const afterExit = await executor.getOrderStatus(
      placed.brokerOrderId,
      TEST_ACCOUNT_ID,
    );
    expect(afterExit.status).toBe(OrderStatus.EXITED);
  });

  it('exit order uses the opposite side (SELL) of the original BUY entry', async () => {
    const placed = await executor.placeEntryOrder(
      entryRequest(),
      TEST_ACCOUNT_ID,
    );
    const exited = await executor.exitPosition(
      placed.brokerOrderId,
      new ExitRequest(50),
      TEST_ACCOUNT_ID,
    );

    expect(exited.brokerOrderId).not.toBe(placed.brokerOrderId);
    expect(exited.status).toBe(OrderStatus.FILLED);
  });
});

describe('DhanExecutor + LiveOrderSafetyGateService wiring', () => {
  function blockingGate(reason: string): LiveOrderSafetyGateService {
    return {
      checkEntryAllowed: jest
        .fn()
        .mockResolvedValue({ allowed: false, reason }),
    } as unknown as LiveOrderSafetyGateService;
  }

  it("placeEntryOrder is rejected with the gate's reason when the safety gate blocks it, and never calls the broker", async () => {
    const server = new FakeDhanServer();
    const httpClient = createHttpClient(server);
    const sessionManager = {
      ensureSession: jest.fn().mockResolvedValue(createFakeSession()),
      refresh: jest.fn().mockResolvedValue(createFakeSession()),
    } as unknown as BrokerSessionManager;
    const executor = new DhanExecutor(
      createBrokerAccountRepository(),
      sessionManager,
      blockingGate('broker health is DEGRADED'),
      createConfigService(),
      httpClient,
    );

    await expect(
      executor.placeEntryOrder(entryRequest(), TEST_ACCOUNT_ID),
    ).rejects.toThrow(/broker health is DEGRADED/);
    expect(httpClient.request).not.toHaveBeenCalled();
  });

  it('exitPosition still succeeds even when the safety gate would block a new entry — risk-reducing actions are never gated', async () => {
    const server = new FakeDhanServer();
    const httpClient = createHttpClient(server);
    const sessionManager = {
      ensureSession: jest.fn().mockResolvedValue(createFakeSession()),
      refresh: jest.fn().mockResolvedValue(createFakeSession()),
    } as unknown as BrokerSessionManager;
    // First, place an entry with an always-allow gate so there's something to exit.
    const setupExecutor = new DhanExecutor(
      createBrokerAccountRepository(),
      sessionManager,
      createAlwaysAllowGate(),
      createConfigService(),
      httpClient,
    );
    const placed = await setupExecutor.placeEntryOrder(
      entryRequest(),
      TEST_ACCOUNT_ID,
    );

    // Now exit using an executor instance wired to a gate that blocks every entry.
    const blockingExecutor = new DhanExecutor(
      createBrokerAccountRepository(),
      sessionManager,
      blockingGate('LIVE_TRADING_ENABLED is off'),
      createConfigService(),
      httpClient,
    );

    const exited = await blockingExecutor.exitPosition(
      placed.brokerOrderId,
      new ExitRequest(50),
      TEST_ACCOUNT_ID,
    );

    expect(exited.status).toBe(OrderStatus.FILLED);
  });
});
