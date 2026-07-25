import { ConnectionStates, type Connection } from 'mongoose';
import { DatabaseConnectivityHealthIndicator } from './database-connectivity.health-indicator';
import { HealthStatus } from '../models/health-status.enum';
import { FakeClock } from '../testing/fake-clock';

function fakeConnection(readyState: ConnectionStates): Connection {
  return { readyState } as unknown as Connection;
}

describe('DatabaseConnectivityHealthIndicator', () => {
  it('reports HEALTHY when connected', async () => {
    const indicator = new DatabaseConnectivityHealthIndicator(
      fakeConnection(ConnectionStates.connected),
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.HEALTHY);
  });

  it('reports DISCONNECTED when not connected', async () => {
    const indicator = new DatabaseConnectivityHealthIndicator(
      fakeConnection(ConnectionStates.disconnected),
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.DISCONNECTED);
  });
});
