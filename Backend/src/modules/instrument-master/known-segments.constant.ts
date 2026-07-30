/**
 * Recognized instrument segments — DhanHQ's own `SEM_INSTRUMENT_NAME` CSV
 * values (https://dhanhq.co/docs/v2/annexure/), verified against a real,
 * live download of the instrument/security master
 * (https://images.dhan.co/api-data/api-scrip-master.csv): EQUITY, FUTCOM,
 * FUTCUR, FUTIDX, FUTSTK, INDEX, OPTCUR, OPTFUT, OPTIDX, OPTSTK — the
 * complete, exhaustive set of distinct values found in that download. Used
 * defensively by the resolver to reject a row whose segment it doesn't
 * recognize, rather than resolving to something malformed.
 */
export const KNOWN_SEGMENTS: ReadonlySet<string> = new Set([
  'EQUITY',
  'INDEX',
  'FUTSTK',
  'OPTSTK',
  'FUTIDX',
  'OPTIDX',
  'FUTCOM',
  'OPTFUT',
  'FUTCUR',
  'OPTCUR',
]);
