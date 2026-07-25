import { AngelOneInstrumentMasterProvider } from './angel-one-instrument-master.provider';
import type { IHttpClient } from '@shared/http/http-client.interface';
import { InstrumentMasterDownloadException } from '@modules/instrument-master/exceptions/instrument-master-download.exception';

describe('AngelOneInstrumentMasterProvider', () => {
  let httpClient: jest.Mocked<IHttpClient>;
  let provider: AngelOneInstrumentMasterProvider;

  beforeEach(() => {
    httpClient = { request: jest.fn() };
    provider = new AngelOneInstrumentMasterProvider(httpClient);
  });

  it('reports its broker name', () => {
    expect(provider.brokerName).toBe('angel-one');
  });

  it('downloads and maps valid rows, skipping malformed ones', async () => {
    httpClient.request.mockResolvedValue({
      status: 200,
      body: [
        {
          token: '1',
          symbol: 'NIFTY24500CE',
          name: 'NIFTY',
          expiry: '25JUL2024',
          strike: '2450000.000000',
          lotsize: '50',
          instrumenttype: 'OPTIDX',
          exch_seg: 'NFO',
          tick_size: '0.050000',
        },
        { garbage: true },
      ],
    });

    const instruments = await provider.fetchInstruments();

    expect(instruments).toHaveLength(1);
    expect(instruments[0]?.token).toBe('1');
  });

  it('throws InstrumentMasterDownloadException when the response is not an array', async () => {
    httpClient.request.mockResolvedValue({
      status: 200,
      body: { unexpected: 'shape' },
    });

    await expect(provider.fetchInstruments()).rejects.toThrow(
      InstrumentMasterDownloadException,
    );
  });

  it('throws InstrumentMasterDownloadException when the HTTP call itself fails', async () => {
    httpClient.request.mockRejectedValue(new TypeError('fetch failed'));

    await expect(provider.fetchInstruments()).rejects.toThrow(
      InstrumentMasterDownloadException,
    );
  });

  it('never touches the real network — the mocked client is the only call site', async () => {
    httpClient.request.mockResolvedValue({ status: 200, body: [] });
    await provider.fetchInstruments();
    expect(httpClient.request).toHaveBeenCalledTimes(1);
  });
});
