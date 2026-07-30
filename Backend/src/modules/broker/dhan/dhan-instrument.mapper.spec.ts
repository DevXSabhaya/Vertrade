import { mapDhanInstrument } from './dhan-instrument.mapper';
import { OptionType } from '@modules/instrument-master/option-type.enum';
import type { DhanRawInstrument } from './dhan-instrument-raw.dto';

function rawRow(overrides: Partial<DhanRawInstrument> = {}): DhanRawInstrument {
  return {
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
    ...overrides,
  };
}

describe('mapDhanInstrument', () => {
  it('maps a valid NSE option row, parsing the strike and expiry directly (no scale factor)', () => {
    const instrument = mapDhanInstrument(rawRow());

    expect(instrument).not.toBeNull();
    expect(instrument?.token).toBe('49081');
    expect(instrument?.exchange).toBe('NSE_FNO');
    expect(instrument?.segment).toBe('OPTIDX');
    expect(instrument?.strike).toBe(24500);
    expect(instrument?.optionType).toBe(OptionType.CE);
    expect(instrument?.lotSize).toBe(50);
    expect(instrument?.tickSize).toBe(0.05);
    expect(instrument?.precision).toBe(2);
    expect(instrument?.expiry?.getUTCFullYear()).toBe(2024);
    expect(instrument?.expiry?.getUTCMonth()).toBe(6); // July, 0-indexed
    expect(instrument?.expiry?.getUTCDate()).toBe(25);
  });

  it('derives the underlying (Instrument.name, the key InstrumentCache.findByUnderlying groups by) from SEM_TRADING_SYMBOL, never from SM_SYMBOL_NAME', () => {
    // Regression test for a real bug found auditing against a live CSV
    // download: NSE index options (NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY)
    // ship with an EMPTY SM_SYMBOL_NAME column — using it as the underlying
    // key made every one of those options resolve to its own unique,
    // ungroupable "underlying" and broke resolution entirely.
    const instrument = mapDhanInstrument(
      rawRow({
        SM_SYMBOL_NAME: '',
        SEM_TRADING_SYMBOL: 'NIFTY-Jul2024-24500-CE',
      }),
    );
    expect(instrument?.name).toBe('NIFTY');
  });

  it('derives the underlying correctly even when SM_SYMBOL_NAME is a series/group label, not the underlying (e.g. real SENSEX/RELIANCE options ship SM_SYMBOL_NAME="BSXOPT"/"RELIOPT")', () => {
    const instrument = mapDhanInstrument(
      rawRow({
        SM_SYMBOL_NAME: 'BSXOPT',
        SEM_TRADING_SYMBOL: 'SENSEX-Sep2026-68000-CE',
      }),
    );
    expect(instrument?.name).toBe('SENSEX');
  });

  it('derives the underlying for a bare (non-hyphenated) trading symbol, e.g. an equity or a raw index row', () => {
    expect(
      mapDhanInstrument(rawRow({ SEM_TRADING_SYMBOL: 'RELIANCE' }))?.name,
    ).toBe('RELIANCE');
    expect(
      mapDhanInstrument(rawRow({ SEM_TRADING_SYMBOL: 'BANKNIFTY' }))?.name,
    ).toBe('BANKNIFTY');
  });

  it('maps a PE row correctly', () => {
    const instrument = mapDhanInstrument(rawRow({ SEM_OPTION_TYPE: 'PE' }));
    expect(instrument?.optionType).toBe(OptionType.PE);
  });

  it('maps an NSE equity row with no strike or expiry', () => {
    const instrument = mapDhanInstrument(
      rawRow({
        SEM_SEGMENT: 'E',
        SEM_INSTRUMENT_NAME: 'EQUITY',
        SEM_TRADING_SYMBOL: 'RELIANCE',
        SEM_EXPIRY_DATE: '',
        SEM_STRIKE_PRICE: '0',
        SEM_OPTION_TYPE: 'XX',
        SEM_TICK_SIZE: '5',
        SEM_LOT_UNITS: '1',
      }),
    );

    expect(instrument).not.toBeNull();
    expect(instrument?.exchange).toBe('NSE_EQ');
    expect(instrument?.strike).toBeNull();
    expect(instrument?.expiry).toBeNull();
    expect(instrument?.optionType).toBeNull();
  });

  it('maps an index row (NIFTY) to IDX_I regardless of the listing exchange', () => {
    const instrument = mapDhanInstrument(
      rawRow({
        SEM_EXM_EXCH_ID: 'NSE',
        SEM_SEGMENT: 'I',
        SEM_INSTRUMENT_NAME: 'INDEX',
        SEM_TRADING_SYMBOL: 'NIFTY',
        SEM_STRIKE_PRICE: '0',
        SEM_OPTION_TYPE: 'XX',
        SEM_EXPIRY_DATE: '',
      }),
    );
    expect(instrument?.exchange).toBe('IDX_I');
  });

  it('maps SENSEX (a BSE index) to IDX_I as well', () => {
    const instrument = mapDhanInstrument(
      rawRow({
        SEM_EXM_EXCH_ID: 'BSE',
        SEM_SEGMENT: 'I',
        SEM_INSTRUMENT_NAME: 'INDEX',
        SEM_TRADING_SYMBOL: 'SENSEX',
        SEM_STRIKE_PRICE: '0',
        SEM_OPTION_TYPE: 'XX',
        SEM_EXPIRY_DATE: '',
      }),
    );
    expect(instrument?.exchange).toBe('IDX_I');
  });

  it('maps an MCX commodity row (CRUDEOIL)', () => {
    const instrument = mapDhanInstrument(
      rawRow({
        SEM_EXM_EXCH_ID: 'MCX',
        SEM_SEGMENT: 'M',
        SEM_INSTRUMENT_NAME: 'FUTCOM',
        SEM_TRADING_SYMBOL: 'CRUDEOIL',
        SEM_STRIKE_PRICE: '0',
        SEM_OPTION_TYPE: 'XX',
        SEM_EXPIRY_DATE: '2024-07-19 23:30:00',
      }),
    );
    expect(instrument?.exchange).toBe('MCX_COMM');
  });

  it('returns null when the security id or trading symbol is missing', () => {
    expect(mapDhanInstrument(rawRow({ SEM_SMST_SECURITY_ID: '' }))).toBeNull();
    expect(mapDhanInstrument(rawRow({ SEM_TRADING_SYMBOL: '' }))).toBeNull();
  });

  it('returns null when the (exchange, segment) pair is unrecognized', () => {
    expect(
      mapDhanInstrument(
        rawRow({ SEM_EXM_EXCH_ID: 'UNKNOWN', SEM_SEGMENT: 'Z' }),
      ),
    ).toBeNull();
  });

  it('returns null when lot units or tick size are not numeric', () => {
    expect(
      mapDhanInstrument(rawRow({ SEM_LOT_UNITS: 'not-a-number' })),
    ).toBeNull();
    expect(
      mapDhanInstrument(rawRow({ SEM_TICK_SIZE: 'not-a-number' })),
    ).toBeNull();
  });
});
