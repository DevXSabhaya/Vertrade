import { inspect } from 'node:util';
import { BrokerCredentials } from './broker-credentials.vo';

describe('BrokerCredentials', () => {
  const credentials = new BrokerCredentials(
    'api-key',
    'C123',
    'super-secret-password',
    'JBSWY3DPEHPK3PXP',
  );

  it('exposes password and totp secret only via explicit getters', () => {
    expect(credentials.getPassword()).toBe('super-secret-password');
    expect(credentials.getTotpSecret()).toBe('JBSWY3DPEHPK3PXP');
  });

  it('redacts the password and totp secret when JSON-serialized', () => {
    const json = JSON.stringify(credentials);
    expect(json).not.toContain('super-secret-password');
    expect(json).not.toContain('JBSWY3DPEHPK3PXP');
    expect(json).toContain('[REDACTED]');
  });

  it('redacts secrets when printed via util.inspect (as console.log would)', () => {
    const printed = inspect(credentials);
    expect(printed).not.toContain('super-secret-password');
    expect(printed).not.toContain('JBSWY3DPEHPK3PXP');
  });

  it('redacts secrets in toString()', () => {
    expect(credentials.toString()).not.toContain('super-secret-password');
    expect(credentials.toString()).toContain('C123');
  });
});
