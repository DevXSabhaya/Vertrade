import { BrokerToken } from '../value-objects/broker-token.vo';
import { BrokerSession } from './broker-session.entity';

describe('BrokerSession', () => {
  const token = new BrokerToken('jwt', 'refresh', 'feed');

  it('is not expired before its expiresAt time', () => {
    const session = new BrokerSession(
      'C123',
      token,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );
    expect(session.isExpired(new Date('2026-01-01T12:00:00Z'))).toBe(false);
  });

  it('is expired at or after its expiresAt time', () => {
    const session = new BrokerSession(
      'C123',
      token,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );
    expect(session.isExpired(new Date('2026-01-02T00:00:00Z'))).toBe(true);
    expect(session.isExpired(new Date('2026-01-03T00:00:00Z'))).toBe(true);
  });

  it('redacts the token when JSON-serialized', () => {
    const session = new BrokerSession('C123', token, new Date(), new Date());
    const json = JSON.stringify(session);
    expect(json).not.toContain('"jwt"');
    expect(json).not.toContain('"refresh"');
  });
});
