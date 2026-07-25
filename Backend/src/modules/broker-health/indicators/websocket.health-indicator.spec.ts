import type { MarketDataService } from '@modules/market-data/market-data.service';
import { MarketDataConnectionState } from '@modules/market-data/models/market-data-connection-state.enum';
import { MarketDataProviderType } from '@modules/market-data/models/market-data-provider-type.enum';
import type { MarketDataHealth } from '@modules/market-data/models/market-data-health.model';
import { WebSocketHealthIndicator } from './websocket.health-indicator';
import { HealthStatus } from '../models/health-status.enum';
import { HealthMonitorConfig } from '../models/health-monitor-config.model';
import { FakeClock } from '../testing/fake-clock';

function fakeMarketDataService(health: MarketDataHealth): MarketDataService {
  return { getHealth: () => health } as unknown as MarketDataService;
}

const config: HealthMonitorConfig = {
  healthCheckIntervalMs: 30_000,
  heartbeatTimeoutMs: 15_000,
  retryCount: 3,
  reconnectBaseDelayMs: 1_000,
  reconnectMaxDelayMs: 30_000,
  reconnectJitterRatio: 0.2,
  brokerTimeoutMs: 10_000,
  instrumentFreshnessThresholdMs: 86_400_000,
  maintenanceMode: false,
};

describe('WebSocketHealthIndicator', () => {
  it('reports DISCONNECTED (WebSocket failure) when the feed is disconnected', async () => {
    const indicator = new WebSocketHealthIndicator(
      fakeMarketDataService({
        providerType: MarketDataProviderType.MOCK,
        state: MarketDataConnectionState.DISCONNECTED,
        connected: false,
        latencyMs: null,
        heartbeatAgeMs: null,
        subscriptionsCount: 0,
      }),
      config,
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.DISCONNECTED);
  });

  it('reports RECOVERING while the feed is reconnecting', async () => {
    const indicator = new WebSocketHealthIndicator(
      fakeMarketDataService({
        providerType: MarketDataProviderType.MOCK,
        state: MarketDataConnectionState.RECONNECTING,
        connected: false,
        latencyMs: null,
        heartbeatAgeMs: null,
        subscriptionsCount: 0,
      }),
      config,
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.RECOVERING);
  });

  it('reports WARNING when connected but the heartbeat is stale', async () => {
    const indicator = new WebSocketHealthIndicator(
      fakeMarketDataService({
        providerType: MarketDataProviderType.MOCK,
        state: MarketDataConnectionState.CONNECTED,
        connected: true,
        latencyMs: 10,
        heartbeatAgeMs: 20_000,
        subscriptionsCount: 1,
      }),
      config,
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.WARNING);
  });

  it('reports HEALTHY (Healthy broker) when connected with a fresh heartbeat', async () => {
    const indicator = new WebSocketHealthIndicator(
      fakeMarketDataService({
        providerType: MarketDataProviderType.MOCK,
        state: MarketDataConnectionState.CONNECTED,
        connected: true,
        latencyMs: 10,
        heartbeatAgeMs: 1_000,
        subscriptionsCount: 1,
      }),
      config,
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.HEALTHY);
  });
});
