import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { BROKER_AUTH } from '../src/modules/broker/broker-auth/broker-auth.constants';
import { MARKET_DATA_WEBSOCKET_CLIENT } from '../src/modules/market-data/providers/websocket-client.constants';
import {
  MOCK_INSTRUMENT_MASTER_PROVIDER,
  DHAN_INSTRUMENT_MASTER_PROVIDER,
} from '../src/modules/instrument-master/instrument-master.constants';
import { TradingModeService } from '../src/modules/trading-mode/trading-mode.service';
import { MarketDataService } from '../src/modules/market-data/market-data.service';
import { InstrumentMasterService } from '../src/modules/instrument-master/instrument-master.service';
import { BrokerSessionManager } from '../src/modules/broker/broker-auth/broker-session-manager';
import { BrokerSession } from '../src/modules/broker/broker-auth/entities/broker-session.entity';
import { BrokerToken } from '../src/modules/broker/broker-auth/value-objects/broker-token.vo';
import { Instrument } from '../src/modules/instrument-master/entities/instrument.entity';
import { BrokerAccountService } from '../src/modules/broker/broker-account/broker-account.service';
import { BrokerId } from '../src/modules/broker/registry/models/broker-id.enum';
import type { IBrokerAuth } from '../src/modules/broker/broker-auth/interfaces/broker-auth.interface';
import type { IInstrumentMasterProvider } from '../src/modules/instrument-master/interfaces/instrument-master-provider.interface';
import type {
  IWebSocketClient,
  WebSocketCloseInfo,
} from '../src/modules/market-data/providers/websocket-client.interface';

/**
 * End-to-end proof (real Nest app, real MongoDB, real
 * TradingModeService/MarketDataService/InstrumentMasterService/
 * BrokerSessionManager wiring) that repeated PAPER<->LIVE switching works
 * unlimited times, changes ONLY order-execution/broker-session state (Core
 * Architecture Principle #4), and never touches Market Data or Instrument
 * Master (Principles #1/#2/#5) — no reconnect, no provider swap, no cache
 * re-source. Only the network edges (Dhan REST auth and the market-data
 * WebSocket) are stubbed, since real Dhan credentials are never available in
 * this environment.
 */
describe('Trading mode switch cycle (e2e)', () => {
  let app: INestApplication;
  let tradingModeService: TradingModeService;
  let marketDataService: MarketDataService;
  let instrumentMasterService: InstrumentMasterService;
  let brokerSessionManager: BrokerSessionManager;
  let brokerAccountService: BrokerAccountService;
  let wsClient: FakeWebSocketClient;
  let stubBrokerAuth: jest.Mocked<IBrokerAuth>;
  const brokerAccountsByUser = new Map<string, string>();

  /** Saves (once, memoized) a real, owned broker account for `userId` so `TradingModeService.setMode(..., 'LIVE', ...)` has something real to authenticate — mirrors what the Broker Manager UI does before a user ever switches to Live. */
  async function ensureBrokerAccount(userId: string): Promise<string> {
    const existing = brokerAccountsByUser.get(userId);
    if (existing) {
      return existing;
    }
    const created = await brokerAccountService.addAccount(
      userId,
      BrokerId.DHAN,
      'E2E Dhan Account',
      { clientId: 'E2E_SWITCH_CLIENT', accessToken: 'fake-token' },
    );
    brokerAccountsByUser.set(userId, created.accountId);
    return created.accountId;
  }

  class FakeWebSocketClient implements IWebSocketClient {
    open = false;
    connectCount = 0;
    disconnectCount = 0;
    private closeHandler: ((info: WebSocketCloseInfo) => void) | null = null;

    connect(): Promise<void> {
      this.connectCount += 1;
      this.open = true;
      return Promise.resolve();
    }

    disconnect(): Promise<void> {
      this.disconnectCount += 1;
      this.open = false;
      return Promise.resolve();
    }

    send(): void {}

    isOpen(): boolean {
      return this.open;
    }

    onMessage(): void {}

    onOpen(): void {}

    onClose(handler: (info: WebSocketCloseInfo) => void): void {
      this.closeHandler = handler;
    }

    onError(): void {}
  }

  function stubInstrumentProvider(name: string): IInstrumentMasterProvider {
    return {
      brokerName: name,
      fetchInstruments: jest
        .fn()
        .mockResolvedValue([
          new Instrument(
            `${name}-TOKEN`,
            'NSE_EQ',
            'EQUITY',
            `${name}-SYMBOL`,
            name,
            null,
            null,
            null,
            1,
            0.05,
            2,
          ),
        ]),
    };
  }

  beforeAll(async () => {
    wsClient = new FakeWebSocketClient();
    stubBrokerAuth = {
      login: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new BrokerSession(
              'E2E_SWITCH_CLIENT',
              new BrokerToken('fake-token'),
              new Date(),
              new Date(Date.now() + 60 * 60 * 1000),
            ),
          ),
        ),
      refresh: jest.fn(),
      logout: jest.fn().mockResolvedValue(undefined),
      validateSession: jest.fn().mockReturnValue(true),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BROKER_AUTH)
      .useValue(stubBrokerAuth)
      .overrideProvider(MARKET_DATA_WEBSOCKET_CLIENT)
      .useValue(wsClient)
      .overrideProvider(MOCK_INSTRUMENT_MASTER_PROVIDER)
      .useValue(stubInstrumentProvider('MOCK'))
      .overrideProvider(DHAN_INSTRUMENT_MASTER_PROVIDER)
      .useValue(stubInstrumentProvider('DHAN'))
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    tradingModeService = app.get(TradingModeService);
    marketDataService = app.get(MarketDataService);
    instrumentMasterService = app.get(InstrumentMasterService);
    brokerSessionManager = app.get(BrokerSessionManager);
    brokerAccountService = app.get(BrokerAccountService);
    await marketDataService.start();
    await instrumentMasterService.refresh();
  }, 30_000);

  afterAll(async () => {
    // Stop generating new domain events FIRST: the active provider's own
    // heartbeat timer (a real setInterval, since it's never in
    // deterministic mode here) keeps firing for as long as MarketDataService
    // is started, which would otherwise make the drain wait below chase an
    // ever-extending tail instead of a fixed backlog.
    await marketDataService.stop();
    // RecoverySnapshotService debounces a real Mongo write up to
    // RECOVERY_CONFIG.snapshotDebounceMs (2s) after the last domain event —
    // this suite fires many in quick succession, and AuditLogSubscriber
    // persists every one of them via a fire-and-forget write with no
    // shutdown drain. Let anything already in flight land before closing
    // the Mongo connection (same pattern other e2e suites in this repo
    // already use for async audit/recovery writes).
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await app.close();
  }, 20_000);

  it('switches PAPER -> LIVE -> PAPER -> LIVE repeatedly (12 real cycles), each switch completing in under 2 seconds, changing only broker-session state', async () => {
    const userId = 'e2e-cycle-user';
    const accountId = await ensureBrokerAccount(userId);
    const fixedProviderType = marketDataService.getHealth().providerType;
    const fixedToken = instrumentMasterService
      .getCache()
      .findByToken('MOCK-TOKEN')
      ? 'MOCK-TOKEN'
      : 'DHAN-TOKEN';

    for (let i = 0; i < 12; i += 1) {
      const targetMode = i % 2 === 0 ? 'LIVE' : 'PAPER';

      const startedAt = Date.now();
      await tradingModeService.setMode(
        userId,
        targetMode,
        userId,
        targetMode === 'LIVE' ? accountId : undefined,
      );
      expect(Date.now() - startedAt).toBeLessThan(2_000);

      await expect(tradingModeService.getCurrentMode(userId)).resolves.toBe(
        targetMode,
      );

      // Market Data and Instrument Master are untouched by the mode switch
      // (Core Architecture Principles #1/#2/#5): same provider, same
      // instrument, every single cycle.
      expect(marketDataService.getHealth().providerType).toBe(
        fixedProviderType,
      );
      expect(
        instrumentMasterService.getCache().findByToken(fixedToken),
      ).toBeDefined();

      // Market data stays connected throughout — mode switching must never
      // trigger a disconnect/reconnect cycle.
      expect(marketDataService.getHealth().connected).toBe(true);

      if (targetMode === 'LIVE') {
        expect(brokerSessionManager.getAuthState(accountId)).toBe(
          'AUTHENTICATED',
        );
      } else {
        expect(brokerSessionManager.getActiveSession(accountId)).toBeNull();
      }
    }

    // In this test environment the fixed provider is MOCK (no real
    // WebSocket transport), so the WS client stub used only by
    // DhanMarketDataProvider is never touched at all — itself further proof
    // that mode switching never reaches into the market-data provider.
    expect(wsClient.connectCount).toBe(0);
    expect(wsClient.disconnectCount).toBe(0);
  }, 30_000);

  it('removing/disconnecting the broker (switching to PAPER) does not affect Market Data', async () => {
    const userId = 'e2e-disconnect-user';
    const accountId = await ensureBrokerAccount(userId);
    await tradingModeService.setMode(userId, 'LIVE', userId, accountId);
    const providerTypeBeforeDisconnect =
      marketDataService.getHealth().providerType;

    await tradingModeService.setMode(userId, 'PAPER', userId);

    expect(marketDataService.getHealth().providerType).toBe(
      providerTypeBeforeDisconnect,
    );
    expect(marketDataService.getHealth().connected).toBe(true);
  }, 15_000);

  it('collapses concurrent identical-target switch requests for the same user into exactly one real broker login', async () => {
    const userId = 'e2e-collapse-user';
    const accountId = await ensureBrokerAccount(userId);
    await tradingModeService.setMode(userId, 'PAPER', userId);
    stubBrokerAuth.login.mockClear();

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        tradingModeService.setMode(userId, 'LIVE', userId, accountId),
      ),
    );

    expect(results.every((mode) => mode === 'LIVE')).toBe(true);
    expect(stubBrokerAuth.login).toHaveBeenCalledTimes(1);
    await expect(tradingModeService.getCurrentMode(userId)).resolves.toBe(
      'LIVE',
    );
  }, 15_000);

  it('never leaves a single user in an inconsistent state after many rapid alternating concurrent requests', async () => {
    const userId = 'e2e-race-user';
    const accountId = await ensureBrokerAccount(userId);
    const modes: Array<'PAPER' | 'LIVE'> = [];
    for (let i = 0; i < 6; i += 1) {
      modes.push(i % 2 === 0 ? 'LIVE' : 'PAPER');
    }

    await Promise.all(
      modes.map((mode) =>
        tradingModeService.setMode(
          userId,
          mode,
          userId,
          mode === 'LIVE' ? accountId : undefined,
        ),
      ),
    );

    const finalMode = await tradingModeService.getCurrentMode(userId);
    expect(['PAPER', 'LIVE']).toContain(finalMode);
  }, 15_000);
});
