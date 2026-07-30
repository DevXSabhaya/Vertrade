import { DhanInstrumentMasterProvider } from './dhan-instrument-master.provider';
import type { IHttpClient } from '@shared/http/http-client.interface';
import { InstrumentMasterDownloadException } from '@modules/instrument-master/exceptions/instrument-master-download.exception';
import { DHAN_INSTRUMENT_CSV_HEADER } from './dhan-instrument-raw.dto';

function csvRow(overrides: Partial<Record<string, string>> = {}): string {
  const defaults: Record<string, string> = {
    SEM_EXM_EXCH_ID: 'NSE',
    SEM_SEGMENT: 'D',
    SEM_SMST_SECURITY_ID: '49081',
    SEM_INSTRUMENT_NAME: 'OPTIDX',
    SEM_EXPIRY_CODE: '0',
    SEM_TRADING_SYMBOL: 'NIFTY-Jul2024-24500-CE',
    SEM_LOT_UNITS: '50',
    SEM_CUSTOM_SYMBOL: 'NIFTY 24500 CE',
    SEM_EXPIRY_DATE: '2024-07-25 14:30:00',
    SEM_STRIKE_PRICE: '24500',
    SEM_OPTION_TYPE: 'CE',
    SEM_TICK_SIZE: '0.05',
    SEM_EXPIRY_FLAG: 'M',
    SEM_EXCH_INSTRUMENT_TYPE: 'OP',
    SEM_SERIES: 'XX',
    SM_SYMBOL_NAME: 'NIFTY',
  };
  const merged = { ...defaults, ...overrides };
  return DHAN_INSTRUMENT_CSV_HEADER.map((key) => merged[key]).join(',');
}

const HEADER_LINE = DHAN_INSTRUMENT_CSV_HEADER.join(',');

describe('DhanInstrumentMasterProvider', () => {
  let httpClient: jest.Mocked<IHttpClient>;
  let provider: DhanInstrumentMasterProvider;

  beforeEach(() => {
    httpClient = { request: jest.fn() };
    provider = new DhanInstrumentMasterProvider(httpClient);
  });

  it('reports its broker name', () => {
    expect(provider.brokerName).toBe('dhan');
  });

  it('downloads and maps valid rows, skipping malformed ones', async () => {
    const malformedRow = 'too,few,columns';
    httpClient.request.mockResolvedValue({
      status: 200,
      body: [HEADER_LINE, csvRow(), malformedRow].join('\n'),
    });

    const instruments = await provider.fetchInstruments();

    expect(instruments).toHaveLength(1);
    expect(instruments[0]?.token).toBe('49081');
    expect(instruments[0]?.exchange).toBe('NSE_FNO');
  });

  it('requests the CSV as text, not JSON', async () => {
    httpClient.request.mockResolvedValue({
      status: 200,
      body: [HEADER_LINE, csvRow()].join('\n'),
    });

    await provider.fetchInstruments();

    expect(httpClient.request).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ responseType: 'text' }),
    );
  });

  it('throws InstrumentMasterDownloadException when the response body is not a non-empty string', async () => {
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
    httpClient.request.mockResolvedValue({ status: 200, body: HEADER_LINE });
    await provider.fetchInstruments();
    expect(httpClient.request).toHaveBeenCalledTimes(1);
  });
});
