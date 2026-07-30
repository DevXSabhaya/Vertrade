import { inspect } from 'node:util';
import { BrokerCredentials } from './broker-credentials.vo';

describe('BrokerCredentials', () => {
  const credentials = new BrokerCredentials(
    'C123',
    'api-key',
    'super-secret-access-token',
  );

  it('exposes the access token only via an explicit getter', () => {
    expect(credentials.getAccessToken()).toBe('super-secret-access-token');
  });

  it('redacts the access token when JSON-serialized', () => {
    const json = JSON.stringify(credentials);
    expect(json).not.toContain('super-secret-access-token');
    expect(json).toContain('[REDACTED]');
  });

  it('redacts the access token when printed via util.inspect (as console.log would)', () => {
    const printed = inspect(credentials);
    expect(printed).not.toContain('super-secret-access-token');
  });

  it('redacts the access token in toString()', () => {
    expect(credentials.toString()).not.toContain('super-secret-access-token');
    expect(credentials.toString()).toContain('C123');
  });
});
