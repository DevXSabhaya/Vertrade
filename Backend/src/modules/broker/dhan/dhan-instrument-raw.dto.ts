/**
 * Shape of a single row in Dhan's publicly published instrument/security
 * master CSV, per its documented column set
 * (https://dhanhq.co/docs/v2/annexure/) and verified against a real, live
 * download (205,808 rows). All values arrive as strings — the CSV has no
 * type information — and every column used here was confirmed present on
 * real NIFTY/BANKNIFTY/FINNIFTY/SENSEX/CRUDEOIL/RELIANCE rows.
 */
export interface DhanRawInstrument {
  SEM_EXM_EXCH_ID: string;
  SEM_SEGMENT: string;
  SEM_SMST_SECURITY_ID: string;
  SEM_INSTRUMENT_NAME: string;
  SEM_EXPIRY_CODE: string;
  SEM_TRADING_SYMBOL: string;
  SEM_LOT_UNITS: string;
  SEM_CUSTOM_SYMBOL: string;
  SEM_EXPIRY_DATE: string;
  SEM_STRIKE_PRICE: string;
  SEM_OPTION_TYPE: string;
  SEM_TICK_SIZE: string;
  SEM_EXPIRY_FLAG: string;
  SEM_EXCH_INSTRUMENT_TYPE: string;
  SEM_SERIES: string;
  SM_SYMBOL_NAME: string;
}

export const DHAN_INSTRUMENT_CSV_HEADER: (keyof DhanRawInstrument)[] = [
  'SEM_EXM_EXCH_ID',
  'SEM_SEGMENT',
  'SEM_SMST_SECURITY_ID',
  'SEM_INSTRUMENT_NAME',
  'SEM_EXPIRY_CODE',
  'SEM_TRADING_SYMBOL',
  'SEM_LOT_UNITS',
  'SEM_CUSTOM_SYMBOL',
  'SEM_EXPIRY_DATE',
  'SEM_STRIKE_PRICE',
  'SEM_OPTION_TYPE',
  'SEM_TICK_SIZE',
  'SEM_EXPIRY_FLAG',
  'SEM_EXCH_INSTRUMENT_TYPE',
  'SEM_SERIES',
  'SM_SYMBOL_NAME',
];

/**
 * Parses one CSV data row (already split on commas, in header column order)
 * into a raw instrument record. Returns null if the row doesn't have the
 * expected number of columns — a handful of malformed rows should never
 * fail the entire load.
 */
export function parseDhanCsvRow(
  header: (keyof DhanRawInstrument)[],
  columns: string[],
): DhanRawInstrument | null {
  if (columns.length !== header.length) {
    return null;
  }
  const record = {} as DhanRawInstrument;
  header.forEach((key, index) => {
    record[key] = columns[index];
  });
  return record;
}
