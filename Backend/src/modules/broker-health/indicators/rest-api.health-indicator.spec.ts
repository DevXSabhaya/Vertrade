import type { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { RestApiHealthIndicator } from './rest-api.health-indicator';
import { HealthStatus } from '../models/health-status.enum';
import { FakeClock } from '../testing/fake-clock';

describe('RestApiHealthIndicator', () => {
  it('reports HEALTHY when every active account session is valid', async () => {
    const sessionManager = {
      getAllActiveAccountIds: () => ['acc-1', 'acc-2'],
      isSessionValid: () => true,
    } as unknown as BrokerSessionManager;
    const indicator = new RestApiHealthIndicator(
      sessionManager,
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.HEALTHY);
  });

  it('reports DISCONNECTED when there are no active accounts at all', async () => {
    const sessionManager = {
      getAllActiveAccountIds: () => [],
      isSessionValid: () => false,
    } as unknown as BrokerSessionManager;
    const indicator = new RestApiHealthIndicator(
      sessionManager,
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.DISCONNECTED);
  });

  it('reports DISCONNECTED when every active account session is invalid', async () => {
    const sessionManager = {
      getAllActiveAccountIds: () => ['acc-1'],
      isSessionValid: () => false,
    } as unknown as BrokerSessionManager;
    const indicator = new RestApiHealthIndicator(
      sessionManager,
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.DISCONNECTED);
  });

  it('reports DEGRADED when some, but not all, active account sessions are valid', async () => {
    const sessionManager = {
      getAllActiveAccountIds: () => ['acc-1', 'acc-2'],
      isSessionValid: (accountId: string) => accountId === 'acc-1',
    } as unknown as BrokerSessionManager;
    const indicator = new RestApiHealthIndicator(
      sessionManager,
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.DEGRADED);
  });
});
