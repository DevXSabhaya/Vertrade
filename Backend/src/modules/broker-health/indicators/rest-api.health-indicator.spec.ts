import type { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { BrokerSession } from '@modules/broker/broker-auth/entities/broker-session.entity';
import { BrokerToken } from '@modules/broker/broker-auth/value-objects/broker-token.vo';
import { RestApiHealthIndicator } from './rest-api.health-indicator';
import { HealthStatus } from '../models/health-status.enum';
import { FakeClock } from '../testing/fake-clock';

function fakeSession(): BrokerSession {
  return new BrokerSession(
    'CLIENT1',
    new BrokerToken('access-token'),
    new Date(),
    new Date(Date.now() + 3_600_000),
  );
}

describe('RestApiHealthIndicator', () => {
  it('reports HEALTHY (REST failure test: absence of session) when a valid session exists', async () => {
    const sessionManager = {
      getActiveSession: () => fakeSession(),
      isSessionValid: () => true,
    } as unknown as BrokerSessionManager;
    const indicator = new RestApiHealthIndicator(
      sessionManager,
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.HEALTHY);
  });

  it('reports DISCONNECTED (REST failure) when there is no valid session', async () => {
    const sessionManager = {
      getActiveSession: () => null,
      isSessionValid: () => false,
    } as unknown as BrokerSessionManager;
    const indicator = new RestApiHealthIndicator(
      sessionManager,
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.DISCONNECTED);
  });
});
