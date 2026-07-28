import { AngelOneAccountService } from './angel-one-account.service';
import { BrokerCredentialsProvider } from './broker-credentials.provider';
import { BrokerCredentials } from './value-objects/broker-credentials.vo';
import { BrokerSession } from './entities/broker-session.entity';
import { BrokerToken } from './value-objects/broker-token.vo';
import type { IBrokerHttpClient } from './interfaces/broker-http-client.interface';

function buildSession(): BrokerSession {
  return new BrokerSession(
    'C123',
    new BrokerToken('jwt-value', 'refresh-value', 'feed-value'),
    new Date(),
    new Date(Date.now() + 3600_000),
  );
}

describe('AngelOneAccountService', () => {
  let httpClient: jest.Mocked<IBrokerHttpClient>;
  let credentialsProvider: BrokerCredentialsProvider;
  let service: AngelOneAccountService;

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
    service = new AngelOneAccountService(credentialsProvider, httpClient);
  });

  it('maps every RMS field it can parse, never fabricating a value Angel One did not return', async () => {
    httpClient.request.mockResolvedValue({
      status: 200,
      body: {
        status: true,
        message: 'SUCCESS',
        errorcode: '',
        data: {
          net: '50000.00',
          availablecash: '45000.50',
          availablelimitmargin: '48000.00',
          m2mrealized: '1200.75',
          m2munrealized: '-300.25',
          utiliseddebits: '2000.00',
        },
      },
    });

    const summary = await service.getFundsSummary(buildSession());

    expect(summary).toEqual({
      availableBalance: 45000.5,
      usedMargin: 2000.0,
      availableMargin: 48000.0,
      todaysRealizedPnl: 1200.75,
      unrealizedPnl: -300.25,
    });
  });

  it('falls back to net when availablelimitmargin is missing', async () => {
    httpClient.request.mockResolvedValue({
      status: 200,
      body: {
        status: true,
        message: 'SUCCESS',
        errorcode: '',
        data: { net: '50000.00' },
      },
    });

    const summary = await service.getFundsSummary(buildSession());

    expect(summary.availableMargin).toBe(50000.0);
  });

  it('returns every field as null (never zero or fabricated) when Angel One reports failure', async () => {
    httpClient.request.mockResolvedValue({
      status: 200,
      body: {
        status: false,
        message: 'Session expired',
        errorcode: 'AG8001',
        data: null,
      },
    });

    const summary = await service.getFundsSummary(buildSession());

    expect(summary).toEqual({
      availableBalance: null,
      usedMargin: null,
      availableMargin: null,
      todaysRealizedPnl: null,
      unrealizedPnl: null,
    });
  });

  it('returns null for a field that is present but not a parseable number', async () => {
    httpClient.request.mockResolvedValue({
      status: 200,
      body: {
        status: true,
        message: 'SUCCESS',
        errorcode: '',
        data: { availablecash: 'not-a-number' },
      },
    });

    const summary = await service.getFundsSummary(buildSession());

    expect(summary.availableBalance).toBeNull();
  });

  it('sends the session bearer token and api key on the RMS request', async () => {
    httpClient.request.mockResolvedValue({
      status: 200,
      body: { status: true, message: 'SUCCESS', errorcode: '', data: {} },
    });

    await service.getFundsSummary(buildSession());

    expect(httpClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: expect.stringContaining('/getRMS'),
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-value',
          'X-PrivateKey': 'api-key',
        }),
      }),
    );
  });
});
