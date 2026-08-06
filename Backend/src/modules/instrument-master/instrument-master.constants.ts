export const MOCK_INSTRUMENT_MASTER_PROVIDER = Symbol(
  'MOCK_INSTRUMENT_MASTER_PROVIDER',
);
export const DHAN_INSTRUMENT_MASTER_PROVIDER = Symbol(
  'DHAN_INSTRUMENT_MASTER_PROVIDER',
);

/**
 * The single provider InstrumentMasterService actually depends on
 * (`IInstrumentMasterProvider`) — selected once, at module-wiring time, from
 * `ConfigService.instrumentMasterProvider`. Never switched based on Trading
 * Mode: the instrument universe is identical for Paper and Live.
 */
export const PRIMARY_INSTRUMENT_MASTER_PROVIDER = Symbol(
  'PRIMARY_INSTRUMENT_MASTER_PROVIDER',
);

export const INSTRUMENT_REPOSITORY = Symbol('INSTRUMENT_REPOSITORY');
