import { DhanAccountService } from './dhan-account.service';
import { BrokerSession } from './entities/broker-session.entity';
import { BrokerToken } from './value-objects/broker-token.vo';
import type { ConfigService } from '@core/config/config.service';
import type { IBrokerHttpClient } from './interfaces/broker-http-client.interface';

const REST_BASE_URL = 'https://api.dhan.invalid/v2';

function buildSession(): BrokerSession {
  return new BrokerSession(
    'C123',
    new BrokerToken('access-token-value'),
    new Date(),
    new Date(Date.now() + 3600_000),
  );
}

describe('DhanAccountService', () => {
  let httpClient: jest.Mocked<IBrokerHttpClient>;
  let configService: ConfigService;
  let service: DhanAccountService;

  beforeEach(() => {
    httpClient = { request: jest.fn() };
    configService = { dhanRestUrl: REST_BASE_URL } as ConfigService;
    service = new DhanAccountService(configService, httpClient);
  });

  it('maps every fund-limit field it can parse, never fabricating a value Dhan did not return', async () => {
    httpClient.request.mockResolvedValue({
      status: 200,
      body: {
        dhanClientId: 'C123',
        sodLimit: 50000,
        availableBalance: 45000.5,
        utilizedAmount: 2000,
        withdrawableBalance: 48000,
      },
    });

    const summary = await service.getFundsSummary(buildSession());

    expect(summary).toEqual({
      availableBalance: 45000.5,
      usedMargin: 2000,
      availableMargin: 48000,
      todaysRealizedPnl: null,
      unrealizedPnl: null,
    });
  });

  it("reads the typo'd availabelBalance field when that is what Dhan returns", async () => {
    httpClient.request.mockResolvedValue({
      status: 200,
      body: { sodLimit: 50000, availabelBalance: 45000.5 },
    });

    const summary = await service.getFundsSummary(buildSession());

    expect(summary.availableBalance).toBe(45000.5);
  });

  it('falls back to availableBalance when withdrawableBalance is missing', async () => {
    httpClient.request.mockResolvedValue({
      status: 200,
      body: { sodLimit: 50000, availableBalance: 50000 },
    });

    const summary = await service.getFundsSummary(buildSession());

    expect(summary.availableMargin).toBe(50000);
  });

  it('returns every field as null (never zero or fabricated) when Dhan returns no usable data', async () => {
    httpClient.request.mockResolvedValue({ status: 200, body: {} });

    const summary = await service.getFundsSummary(buildSession());

    expect(summary).toEqual({
      availableBalance: null,
      usedMargin: null,
      availableMargin: null,
      todaysRealizedPnl: null,
      unrealizedPnl: null,
    });
  });

  it('sends the session access-token header on the fund-limit request', async () => {
    httpClient.request.mockResolvedValue({
      status: 200,
      body: { sodLimit: 0 },
    });

    await service.getFundsSummary(buildSession());

    expect(httpClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: `${REST_BASE_URL}/fundlimit`,
        headers: expect.objectContaining({
          'access-token': 'access-token-value',
        }),
      }),
    );
  });
});
