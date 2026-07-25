import { Inject, Injectable } from '@nestjs/common';
import { HTTP_CLIENT } from '@shared/http/http-client.constants';
import type { IHttpClient } from '@shared/http/http-client.interface';
import type { Instrument } from '@modules/instrument-master/entities/instrument.entity';
import type { IInstrumentMasterProvider } from '@modules/instrument-master/interfaces/instrument-master-provider.interface';
import { InstrumentMasterDownloadException } from '@modules/instrument-master/exceptions/instrument-master-download.exception';
import { ANGEL_ONE_INSTRUMENT_MASTER_URL } from './angel-one.constants';
import { mapAngelOneInstrument } from './angel-one-instrument.mapper';

const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * The ONLY class that knows Angel One's instrument-master URL and raw JSON
 * shape. InstrumentMasterService depends solely on IInstrumentMasterProvider —
 * swapping to another broker means writing one new class like this one.
 */
@Injectable()
export class AngelOneInstrumentMasterProvider implements IInstrumentMasterProvider {
  readonly brokerName = 'angel-one';

  constructor(@Inject(HTTP_CLIENT) private readonly httpClient: IHttpClient) {}

  async fetchInstruments(): Promise<Instrument[]> {
    let response;
    try {
      response = await this.httpClient.request<unknown>(
        ANGEL_ONE_INSTRUMENT_MASTER_URL,
        {
          timeoutMs: DOWNLOAD_TIMEOUT_MS,
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown download error';
      throw new InstrumentMasterDownloadException(
        `Failed to download Angel One instrument master: ${message}`,
      );
    }

    if (!Array.isArray(response.body)) {
      throw new InstrumentMasterDownloadException(
        'Angel One instrument master response was not a JSON array',
      );
    }

    const instruments: Instrument[] = [];
    for (const rawRow of response.body) {
      const mapped = mapAngelOneInstrument(rawRow);
      if (mapped) {
        instruments.push(mapped);
      }
    }
    return instruments;
  }
}
