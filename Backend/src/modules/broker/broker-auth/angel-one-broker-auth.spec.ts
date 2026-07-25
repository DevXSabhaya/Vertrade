import { AngelOneBrokerAuth } from './angel-one-broker-auth';
import { BrokerCredentialsProvider } from './broker-credentials.provider';
import { BrokerCredentials } from './value-objects/broker-credentials.vo';
import { BrokerSession } from './entities/broker-session.entity';
import { BrokerToken } from './value-objects/broker-token.vo';
import type { IBrokerHttpClient } from './interfaces/broker-http-client.interface';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { InvalidTotpException } from './exceptions/invalid-totp.exception';
import { BrokerNetworkException } from './exceptions/broker-network.exception';
import { BrokerTimeoutException } from './exceptions/broker-timeout.exception';

function createJwtWithExpiry(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString(
    'base64url',
  );
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString(
    'base64url',
  );
  return `${header}.${payload}.signature`;
}

describe('AngelOneBrokerAuth', () => {
  let httpClient: jest.Mocked<IBrokerHttpClient>;
  let credentialsProvider: BrokerCredentialsProvider;
  let auth: AngelOneBrokerAuth;

  beforeEach(() => {
    httpClient = { request: jest.fn() };
    credentialsProvider = {
      getCredentials: () =>
        new BrokerCredentials(
          'api-key',
          'C123',
          'password',
          'JBSWY3DPEHPK3PXP',
        ),
    } as BrokerCredentialsProvider;
    auth = new AngelOneBrokerAuth(credentialsProvider, httpClient);
  });

  describe('login', () => {
    it('returns a BrokerSession on a successful response', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      httpClient.request.mockResolvedValue({
        status: 200,
        body: {
          status: true,
          message: 'SUCCESS',
          errorcode: '',
          data: {
            jwtToken: createJwtWithExpiry(futureExp),
            refreshToken: 'refresh-value',
            feedToken: 'feed-value',
          },
        },
      });

      const session = await auth.login();

      expect(session.clientCode).toBe('C123');
      expect(session.token.getRefreshToken()).toBe('refresh-value');
      expect(session.expiresAt.getTime()).toBe(futureExp * 1000);
    });

    it('sends the required Angel One headers and a freshly generated TOTP', async () => {
      httpClient.request.mockResolvedValue({
        status: 200,
        body: {
          status: true,
          message: 'SUCCESS',
          errorcode: '',
          data: { jwtToken: 'a.b.c', refreshToken: 'r', feedToken: 'f' },
        },
      });

      await auth.login();

      expect(httpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-PrivateKey': 'api-key',
            'X-UserType': 'USER',
            'X-SourceID': 'WEB',
          }),
          body: expect.objectContaining({
            clientcode: 'C123',
            password: 'password',
            totp: expect.stringMatching(/^\d{6}$/),
          }),
        }),
      );
    });

    it('throws InvalidCredentialsException when the broker rejects the login', async () => {
      httpClient.request.mockResolvedValue({
        status: 200,
        body: {
          status: false,
          message: 'Invalid Credentials',
          errorcode: 'AB1010',
          data: null,
        },
      });

      await expect(auth.login()).rejects.toThrow(InvalidCredentialsException);
    });

    it('throws InvalidTotpException when the rejection reason mentions TOTP', async () => {
      httpClient.request.mockResolvedValue({
        status: 200,
        body: {
          status: false,
          message: 'Invalid TOTP',
          errorcode: 'AB1050',
          data: null,
        },
      });

      await expect(auth.login()).rejects.toThrow(InvalidTotpException);
    });

    it('throws BrokerTimeoutException when the request times out', async () => {
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'TimeoutError';
      httpClient.request.mockRejectedValue(timeoutError);

      await expect(auth.login()).rejects.toThrow(BrokerTimeoutException);
    });

    it('throws BrokerNetworkException on any other transport failure', async () => {
      httpClient.request.mockRejectedValue(new TypeError('fetch failed'));

      await expect(auth.login()).rejects.toThrow(BrokerNetworkException);
    });

    it('falls back to a default TTL when the JWT has no decodable exp claim', async () => {
      httpClient.request.mockResolvedValue({
        status: 200,
        body: {
          status: true,
          message: 'SUCCESS',
          errorcode: '',
          data: { jwtToken: 'not-a-jwt', refreshToken: 'r', feedToken: 'f' },
        },
      });

      const before = Date.now();
      const session = await auth.login();

      expect(session.expiresAt.getTime()).toBeGreaterThan(before);
    });
  });

  describe('refresh', () => {
    it('returns a new session and preserves the feedToken when the response omits one', async () => {
      const existingSession = new BrokerSession(
        'C123',
        new BrokerToken('old-jwt', 'old-refresh', 'original-feed-token'),
        new Date(),
        new Date(Date.now() + 1000),
      );

      httpClient.request.mockResolvedValue({
        status: 200,
        body: {
          status: true,
          message: 'SUCCESS',
          errorcode: '',
          data: { jwtToken: 'new-jwt', refreshToken: 'new-refresh' },
        },
      });

      const refreshed = await auth.refresh(existingSession);

      expect(refreshed.token.getJwtToken()).toBe('new-jwt');
      expect(refreshed.token.getFeedToken()).toBe('original-feed-token');
    });
  });

  describe('logout', () => {
    it('resolves without error on a successful logout', async () => {
      const session = new BrokerSession(
        'C123',
        new BrokerToken('j', 'r', 'f'),
        new Date(),
        new Date(),
      );
      httpClient.request.mockResolvedValue({
        status: 200,
        body: { status: true, message: 'SUCCESS', errorcode: '', data: null },
      });

      await expect(auth.logout(session)).resolves.toBeUndefined();
    });
  });

  describe('validateSession', () => {
    it('returns true for a session that has not expired', () => {
      const session = new BrokerSession(
        'C123',
        new BrokerToken('j', 'r', 'f'),
        new Date(),
        new Date(Date.now() + 60_000),
      );
      expect(auth.validateSession(session)).toBe(true);
    });

    it('returns false for an expired session', () => {
      const session = new BrokerSession(
        'C123',
        new BrokerToken('j', 'r', 'f'),
        new Date(),
        new Date(Date.now() - 1),
      );
      expect(auth.validateSession(session)).toBe(false);
    });
  });
});
