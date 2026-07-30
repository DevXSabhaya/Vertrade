import type { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { BrokerSession } from '@modules/broker/broker-auth/entities/broker-session.entity';
import { BrokerToken } from '@modules/broker/broker-auth/value-objects/broker-token.vo';
import { BrokerAuthHealthIndicator } from './broker-auth.health-indicator';
import { HealthStatus } from '../models/health-status.enum';
import { FakeClock } from '../testing/fake-clock';

const CLOCK_BASE_MS = 1_700_000_000_000;

/** expiresInMs is relative to FakeClock's own starting time, never real wall-clock time. */
function session(expiresInMs: number): BrokerSession {
  const issuedAt = new Date(CLOCK_BASE_MS);
  return new BrokerSession(
    'CLIENT1',
    new BrokerToken('access-token'),
    issuedAt,
    new Date(CLOCK_BASE_MS + expiresInMs),
  );
}

function sessionManager(overrides: {
  activeSession?: BrokerSession | null;
  isValid?: boolean;
}): BrokerSessionManager {
  return {
    getActiveSession: () => overrides.activeSession ?? null,
    isSessionValid: () => overrides.isValid ?? false,
  } as unknown as BrokerSessionManager;
}

describe('BrokerAuthHealthIndicator', () => {
  it('reports DISCONNECTED when there is no active session', async () => {
    const indicator = new BrokerAuthHealthIndicator(
      sessionManager({ activeSession: null }),
      new FakeClock(CLOCK_BASE_MS),
    );
    const result = await indicator.check();
    expect(result.status).toBe(HealthStatus.DISCONNECTED);
  });

  it('reports DISCONNECTED for an expired/invalid session', async () => {
    const indicator = new BrokerAuthHealthIndicator(
      sessionManager({
        activeSession: session(60 * 60 * 1000),
        isValid: false,
      }),
      new FakeClock(CLOCK_BASE_MS),
    );
    const result = await indicator.check();
    expect(result.status).toBe(HealthStatus.DISCONNECTED);
  });

  it('reports WARNING when the session expires within 5 minutes', async () => {
    const indicator = new BrokerAuthHealthIndicator(
      sessionManager({ activeSession: session(2 * 60 * 1000), isValid: true }),
      new FakeClock(CLOCK_BASE_MS),
    );
    const result = await indicator.check();
    expect(result.status).toBe(HealthStatus.WARNING);
  });

  it('reports HEALTHY for a valid session with plenty of time left', async () => {
    const indicator = new BrokerAuthHealthIndicator(
      sessionManager({ activeSession: session(60 * 60 * 1000), isValid: true }),
      new FakeClock(CLOCK_BASE_MS),
    );
    const result = await indicator.check();
    expect(result.status).toBe(HealthStatus.HEALTHY);
  });
});
