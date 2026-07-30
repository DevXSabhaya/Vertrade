import { Inject, Injectable } from '@nestjs/common';
import { HTTP_CLIENT } from '@shared/http/http-client.constants';
import type { IHttpClient } from '@shared/http/http-client.interface';
import type { Instrument } from '@modules/instrument-master/entities/instrument.entity';
import type { IInstrumentMasterProvider } from '@modules/instrument-master/interfaces/instrument-master-provider.interface';
import { InstrumentMasterDownloadException } from '@modules/instrument-master/exceptions/instrument-master-download.exception';
import { DHAN_INSTRUMENT_MASTER_URL } from './dhan.constants';
import {
  DHAN_INSTRUMENT_CSV_HEADER,
  parseDhanCsvRow,
} from './dhan-instrument-raw.dto';
import { mapDhanInstrument } from './dhan-instrument.mapper';

const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * The ONLY class that knows Dhan's instrument-master URL and raw CSV shape.
 * InstrumentMasterService depends solely on IInstrumentMasterProvider —
 * swapping to another broker means writing one new class like this one.
 */
@Injectable()
export class DhanInstrumentMasterProvider implements IInstrumentMasterProvider {
  readonly brokerName = 'dhan';

  constructor(@Inject(HTTP_CLIENT) private readonly httpClient: IHttpClient) {}

  async fetchInstruments(): Promise<Instrument[]> {
    let response;
    try {
      response = await this.httpClient.request<string>(
        DHAN_INSTRUMENT_MASTER_URL,
        {
          timeoutMs: DOWNLOAD_TIMEOUT_MS,
          responseType: 'text',
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown download error';
      throw new InstrumentMasterDownloadException(
        `Failed to download Dhan instrument master: ${message}`,
      );
    }

    if (typeof response.body !== 'string' || response.body.trim() === '') {
      throw new InstrumentMasterDownloadException(
        'Dhan instrument master response was not a non-empty CSV body',
      );
    }

    return this.parseCsv(response.body);
  }

  private parseCsv(csv: string): Instrument[] {
    const lines = csv.split('\n').filter((line) => line.trim() !== '');
    if (lines.length === 0) {
      return [];
    }

    // First line is the header — verified (via a real live download) to
    // match DHAN_INSTRUMENT_CSV_HEADER's column order, but the data rows are
    // parsed positionally against that known-good header rather than
    // trusting whatever this particular download's header row says, so a
    // subtly reordered response fails loudly instead of silently
    // mis-mapping columns.
    const instruments: Instrument[] = [];
    for (const line of lines.slice(1)) {
      const columns = line.split(',');
      const raw = parseDhanCsvRow(DHAN_INSTRUMENT_CSV_HEADER, columns);
      if (!raw) {
        continue;
      }
      const mapped = mapDhanInstrument(raw);
      if (mapped) {
        instruments.push(mapped);
      }
    }
    return instruments;
  }
}
