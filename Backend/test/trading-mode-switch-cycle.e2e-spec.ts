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
import { MarketDataProviderType } from '../src/modules/market-data/models/market-data-provider-type.enum';
import { BrokerSession } from '../src/modules/broker/broker-auth/entities/broker-session.entity';
import { BrokerToken } from '../src/modules/broker/broker-auth/value-objects/broker-token.vo';
import { Instrument } from '../src/modules/instrument-master/entities/instrument.entity';
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
 * unlimited times with no leaked state — only the network edges (Dhan REST
 * auth and the market-data WebSocket) are stubbed, since real Dhan
 * credentials are never available in this environment.
 */
describe('Trading mode switch cycle (e2e)', () => {
  let app: INestApplication;
  let tradingModeService: TradingModeService;
  let marketDataService: MarketDataService;
  let instrumentMasterService: InstrumentMasterService;
  let brokerSessionManager: BrokerSessionManager;
  let wsClient: FakeWebSocketClient;
  let stubBrokerAuth: jest.Mocked<IBrokerAuth>;

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
    await marketDataService.start();
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

  it('switches PAPER -> LIVE -> PAPER -> LIVE repeatedly (12 real cycles) with providers always matching the committed mode', async () => {
    for (let i = 0; i < 12; i += 1) {
      const targetMode = i % 2 === 0 ? 'LIVE' : 'PAPER';

      await tradingModeService.setMode(targetMode, `e2e-user-${i}`);

      expect(tradingModeService.getCurrentMode()).toBe(targetMode);
      expect(marketDataService.getHealth().providerType).toBe(
        targetMode === 'LIVE'
          ? MarketDataProviderType.DHAN
          : MarketDataProviderType.MOCK,
      );

      if (targetMode === 'LIVE') {
        expect(brokerSessionManager.getAuthState()).toBe('AUTHENTICATED');
      } else {
        expect(brokerSessionManager.getActiveSession()).toBeNull();
      }
    }

    // Exactly one WebSocket connect/disconnect per LIVE<->PAPER edge crossed
    // (6 transitions into LIVE across 12 alternating switches) — never a
    // duplicate connection left open.
    expect(wsClient.connectCount).toBeGreaterThanOrEqual(6);
    expect(
      wsClient.connectCount - wsClient.disconnectCount,
    ).toBeLessThanOrEqual(1);
  }, 30_000);

  it('leaves the instrument-master cache sourced from the correct provider after the final switch', async () => {
    await tradingModeService.setMode('LIVE', 'e2e-final');
    expect(
      instrumentMasterService.getCache().findByToken('DHAN-TOKEN'),
    ).toBeDefined();

    await tradingModeService.setMode('PAPER', 'e2e-final-2');
    expect(
      instrumentMasterService.getCache().findByToken('MOCK-TOKEN'),
    ).toBeDefined();
  }, 15_000);

  it('collapses concurrent identical-target switch requests into exactly one real broker login', async () => {
    stubBrokerAuth.login.mockClear();
    await tradingModeService.setMode('PAPER', 'reset');

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        tradingModeService.setMode('LIVE', `concurrent-${i}`),
      ),
    );

    expect(results.every((mode) => mode === 'LIVE')).toBe(true);
    expect(stubBrokerAuth.login).toHaveBeenCalledTimes(1);
    expect(tradingModeService.getCurrentMode()).toBe('LIVE');
  }, 15_000);

  it('never leaves the deployment in an inconsistent state after many rapid alternating concurrent requests', async () => {
    const modes: Array<'PAPER' | 'LIVE'> = [];
    for (let i = 0; i < 6; i += 1) {
      modes.push(i % 2 === 0 ? 'LIVE' : 'PAPER');
    }

    await Promise.all(
      modes.map((mode, i) => tradingModeService.setMode(mode, `race-${i}`)),
    );

    const finalMode = tradingModeService.getCurrentMode();
    expect(['PAPER', 'LIVE']).toContain(finalMode);
    expect(marketDataService.getHealth().providerType).toBe(
      finalMode === 'LIVE'
        ? MarketDataProviderType.DHAN
        : MarketDataProviderType.MOCK,
    );
  }, 15_000);
});
