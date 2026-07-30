import { inspect } from 'node:util';
import { BrokerToken } from './broker-token.vo';

describe('BrokerToken', () => {
  const token = new BrokerToken('access-token-value');

  it('exposes the access token only via an explicit getter', () => {
    expect(token.getAccessToken()).toBe('access-token-value');
  });

  it('redacts the access token when JSON-serialized', () => {
    const json = JSON.stringify(token);
    expect(json).not.toContain('access-token-value');
  });

  it('redacts the access token when printed via util.inspect', () => {
    const printed = inspect(token);
    expect(printed).not.toContain('access-token-value');
  });
});
