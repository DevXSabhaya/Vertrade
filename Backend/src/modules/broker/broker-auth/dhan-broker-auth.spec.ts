import { DhanBrokerAuth } from './dhan-broker-auth';
import { BrokerCredentialsProvider } from './broker-credentials.provider';
import { BrokerCredentials } from './value-objects/broker-credentials.vo';
import { BrokerSession } from './entities/broker-session.entity';
import { BrokerToken } from './value-objects/broker-token.vo';
import type { ConfigService } from '@core/config/config.service';
import type {
  BrokerHttpRequest,
  IBrokerHttpClient,
} from './interfaces/broker-http-client.interface';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
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

const REST_BASE_URL = 'https://api.dhan.invalid/v2';

describe('DhanBrokerAuth', () => {
  let httpClient: jest.Mocked<IBrokerHttpClient>;
  let credentialsProvider: BrokerCredentialsProvider;
  let configService: ConfigService;
  let auth: DhanBrokerAuth;

  beforeEach(() => {
    httpClient = { request: jest.fn() };
    credentialsProvider = {
      getCredentials: () =>
        new BrokerCredentials('C123', 'api-key', 'configured-access-token'),
    } as BrokerCredentialsProvider;
    configService = { dhanRestUrl: REST_BASE_URL } as ConfigService;
    auth = new DhanBrokerAuth(credentialsProvider, configService, httpClient);
  });

  describe('login', () => {
    it('returns a BrokerSession derived from the exp claim of the configured access token', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      credentialsProvider.getCredentials = () =>
        new BrokerCredentials(
          'C123',
          'api-key',
          createJwtWithExpiry(futureExp),
        );
      httpClient.request.mockResolvedValue({ status: 200, body: {} });

      const session = await auth.login();

      expect(session.clientCode).toBe('C123');
      expect(session.expiresAt.getTime()).toBe(futureExp * 1000);
    });

    it('sends the access-token header and calls the fund-limit probe endpoint', async () => {
      httpClient.request.mockResolvedValue({ status: 200, body: {} });

      await auth.login();

      expect(httpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: `${REST_BASE_URL}/fundlimit`,
          headers: expect.objectContaining({
            'access-token': 'configured-access-token',
          }),
        }),
      );
    });

    it('throws InvalidCredentialsException when Dhan rejects the token', async () => {
      httpClient.request.mockResolvedValue({
        status: 401,
        body: {
          errorCode: 'DH-901',
          errorType: 'Invalid_Authentication',
          errorMessage: 'Invalid Access Token',
        },
      });

      await expect(auth.login()).rejects.toThrow(InvalidCredentialsException);
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

    it('falls back to a default TTL when the access token has no decodable exp claim', async () => {
      credentialsProvider.getCredentials = () =>
        new BrokerCredentials('C123', 'api-key', 'not-a-jwt');
      httpClient.request.mockResolvedValue({ status: 200, body: {} });

      const before = Date.now();
      const session = await auth.login();

      expect(session.expiresAt.getTime()).toBeGreaterThan(before);
    });
  });

  describe('refresh', () => {
    function existingSession(expiresInMs = 1000): BrokerSession {
      return new BrokerSession(
        'C123',
        new BrokerToken('old-access-token'),
        new Date(),
        new Date(Date.now() + expiresInMs),
      );
    }

    it('calls the real POST /RenewToken endpoint with the session token and dhanClientId header', async () => {
      httpClient.request.mockResolvedValue({
        status: 200,
        body: { accessToken: 'renewed-access-token' },
      });

      await auth.refresh(existingSession());

      expect(httpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: `${REST_BASE_URL}/RenewToken`,
          headers: expect.objectContaining({
            'access-token': 'old-access-token',
            dhanClientId: 'C123',
          }),
        }),
      );
    });

    it('adopts the freshly renewed access token, preserving the original clientCode', async () => {
      httpClient.request.mockResolvedValue({
        status: 200,
        body: { accessToken: 'renewed-access-token' },
      });

      const refreshed = await auth.refresh(existingSession());

      expect(refreshed.clientCode).toBe('C123');
      expect(refreshed.token.getAccessToken()).toBe('renewed-access-token');
    });

    it('falls back to re-validating the currently configured DHAN_ACCESS_TOKEN when RenewToken rejects an already-expired session token', async () => {
      httpClient.request.mockImplementation((req: BrokerHttpRequest) =>
        Promise.resolve(
          req.url.endsWith('/RenewToken')
            ? { status: 400, body: { errorMessage: 'Token already expired' } }
            : { status: 200, body: {} },
        ),
      );

      const refreshed = await auth.refresh(existingSession(-1));

      expect(refreshed.clientCode).toBe('C123');
      expect(refreshed.token.getAccessToken()).toBe('configured-access-token');
    });

    it('fails when both RenewToken and the configured-token fallback are rejected', async () => {
      httpClient.request.mockResolvedValue({
        status: 401,
        body: { errorMessage: 'Invalid Access Token' },
      });

      await expect(auth.refresh(existingSession(-1))).rejects.toThrow(
        InvalidCredentialsException,
      );
    });
  });

  describe('logout', () => {
    it('resolves without making any network call — Dhan has no revocation endpoint for this token type', async () => {
      const session = new BrokerSession(
        'C123',
        new BrokerToken('access-token'),
        new Date(),
        new Date(),
      );

      await expect(auth.logout(session)).resolves.toBeUndefined();
      expect(httpClient.request).not.toHaveBeenCalled();
    });
  });

  describe('validateSession', () => {
    it('returns true for a session that has not expired', () => {
      const session = new BrokerSession(
        'C123',
        new BrokerToken('access-token'),
        new Date(),
        new Date(Date.now() + 60_000),
      );
      expect(auth.validateSession(session)).toBe(true);
    });

    it('returns false for an expired session', () => {
      const session = new BrokerSession(
        'C123',
        new BrokerToken('access-token'),
        new Date(),
        new Date(Date.now() - 1),
      );
      expect(auth.validateSession(session)).toBe(false);
    });
  });
});
