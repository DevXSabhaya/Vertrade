import { mapAngelOneInstrument } from './angel-one-instrument.mapper';
import { OptionType } from '@modules/instrument-master/option-type.enum';

describe('mapAngelOneInstrument', () => {
  it('maps a valid option row, scaling the strike and parsing the expiry', () => {
    const raw = {
      token: '12345',
      symbol: 'SENSEX25JUL77200CE',
      name: 'SENSEX',
      expiry: '25JUL2024',
      strike: '7720000.000000',
      lotsize: '10',
      instrumenttype: 'OPTIDX',
      exch_seg: 'BFO',
      tick_size: '0.050000',
    };

    const instrument = mapAngelOneInstrument(raw);

    expect(instrument).not.toBeNull();
    expect(instrument?.token).toBe('12345');
    expect(instrument?.exchange).toBe('BFO');
    expect(instrument?.segment).toBe('OPTIDX');
    expect(instrument?.strike).toBe(77200);
    expect(instrument?.optionType).toBe(OptionType.CE);
    expect(instrument?.lotSize).toBe(10);
    expect(instrument?.tickSize).toBe(0.05);
    expect(instrument?.precision).toBe(2);
    expect(instrument?.expiry?.getUTCFullYear()).toBe(2024);
    expect(instrument?.expiry?.getUTCMonth()).toBe(6); // July, 0-indexed
    expect(instrument?.expiry?.getUTCDate()).toBe(25);
  });

  it('maps a PE row correctly', () => {
    const instrument = mapAngelOneInstrument({
      token: '1',
      symbol: 'NIFTY24500PE',
      name: 'NIFTY',
      expiry: '',
      strike: '2450000.000000',
      lotsize: '50',
      instrumenttype: 'OPTIDX',
      exch_seg: 'NFO',
      tick_size: '0.050000',
    });

    expect(instrument?.optionType).toBe(OptionType.PE);
  });

  it('maps an equity/non-option row with no strike or expiry', () => {
    const instrument = mapAngelOneInstrument({
      token: '99926009',
      symbol: 'RELIANCE-EQ',
      name: 'RELIANCE',
      expiry: '',
      strike: '-1.000000',
      lotsize: '1',
      instrumenttype: '',
      exch_seg: 'NSE',
      tick_size: '5.000000',
    });

    expect(instrument).not.toBeNull();
    expect(instrument?.strike).toBeNull();
    expect(instrument?.expiry).toBeNull();
    expect(instrument?.optionType).toBeNull();
    expect(instrument?.segment).toBe('EQ');
  });

  it('returns null for a row missing required fields', () => {
    expect(mapAngelOneInstrument({ symbol: 'X' })).toBeNull();
  });

  it('returns null for a completely malformed row', () => {
    expect(mapAngelOneInstrument('not an object')).toBeNull();
    expect(mapAngelOneInstrument(null)).toBeNull();
    expect(mapAngelOneInstrument(42)).toBeNull();
  });

  it('returns null when lotsize or tick_size are not numeric', () => {
    const instrument = mapAngelOneInstrument({
      token: '1',
      symbol: 'X',
      name: 'X',
      expiry: '',
      strike: '-1',
      lotsize: 'not-a-number',
      instrumenttype: '',
      exch_seg: 'NSE',
      tick_size: '1',
    });
    expect(instrument).toBeNull();
  });
});
