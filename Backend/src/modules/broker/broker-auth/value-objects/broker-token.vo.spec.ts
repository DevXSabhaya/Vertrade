import { inspect } from 'node:util';
import { BrokerToken } from './broker-token.vo';

describe('BrokerToken', () => {
  const token = new BrokerToken('jwt-value', 'refresh-value', 'feed-value');

  it('exposes each token only via explicit getters', () => {
    expect(token.getJwtToken()).toBe('jwt-value');
    expect(token.getRefreshToken()).toBe('refresh-value');
    expect(token.getFeedToken()).toBe('feed-value');
  });

  it('redacts all three tokens when JSON-serialized', () => {
    const json = JSON.stringify(token);
    expect(json).not.toContain('jwt-value');
    expect(json).not.toContain('refresh-value');
    expect(json).not.toContain('feed-value');
  });

  it('redacts all three tokens when printed via util.inspect', () => {
    const printed = inspect(token);
    expect(printed).not.toContain('jwt-value');
    expect(printed).not.toContain('refresh-value');
    expect(printed).not.toContain('feed-value');
  });
});
