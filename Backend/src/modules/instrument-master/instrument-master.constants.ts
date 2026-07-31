/** @deprecated No longer wired to any DI factory — kept only for source compatibility. Provider selection now comes exclusively from TradingModeService via InstrumentMasterService.initializeForMode/prepareRefreshForMode/commitInstrumentSwitch. */
export const INSTRUMENT_MASTER_PROVIDER = Symbol('INSTRUMENT_MASTER_PROVIDER');
export const MOCK_INSTRUMENT_MASTER_PROVIDER = Symbol(
  'MOCK_INSTRUMENT_MASTER_PROVIDER',
);
export const DHAN_INSTRUMENT_MASTER_PROVIDER = Symbol(
  'DHAN_INSTRUMENT_MASTER_PROVIDER',
);
export const INSTRUMENT_REPOSITORY = Symbol('INSTRUMENT_REPOSITORY');
