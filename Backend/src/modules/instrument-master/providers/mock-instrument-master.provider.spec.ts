import { MockInstrumentMasterProvider } from './mock-instrument-master.provider';
import { OptionType } from '../option-type.enum';

describe('MockInstrumentMasterProvider', () => {
  it('serves plain equities with no strike/optionType/expiry', async () => {
    const provider = new MockInstrumentMasterProvider();
    const instruments = await provider.fetchInstruments();
    const reliance = instruments.find((i) => i.name === 'RELIANCE');

    expect(reliance).toBeDefined();
    expect(reliance?.segment).toBe('EQ');
    expect(reliance?.strike).toBeNull();
    expect(reliance?.optionType).toBeNull();
    expect(reliance?.expiry).toBeNull();
  });

  it('serves a SENSEX 77200 CE contract with a future expiry', async () => {
    const provider = new MockInstrumentMasterProvider();
    const instruments = await provider.fetchInstruments();
    const contract = instruments.find(
      (i) =>
        i.name === 'SENSEX' &&
        i.strike === 77200 &&
        i.optionType === OptionType.CE,
    );

    expect(contract).toBeDefined();
    expect(contract?.exchange).toBe('BSE');
    expect(contract?.segment).toBe('OPTIDX');
    expect(contract?.expiry).not.toBeNull();
    expect((contract?.expiry as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('serves both CE and PE for every index strike', async () => {
    const provider = new MockInstrumentMasterProvider();
    const instruments = await provider.fetchInstruments();
    const niftyStrikes = instruments.filter((i) => i.name === 'NIFTY');
    const ce = niftyStrikes.filter((i) => i.optionType === OptionType.CE);
    const pe = niftyStrikes.filter((i) => i.optionType === OptionType.PE);

    expect(ce.length).toBeGreaterThan(0);
    expect(ce.length).toBe(pe.length);
  });

  it('never produces two instruments with the same underlying+strike+optionType (would make the resolver ambiguous)', async () => {
    const provider = new MockInstrumentMasterProvider();
    const instruments = await provider.fetchInstruments();
    const keys = instruments
      .filter((i) => i.optionType !== null)
      .map((i) => `${i.name}-${i.strike}-${i.optionType}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('produces unique tokens and trading symbols across the entire instrument set', async () => {
    const provider = new MockInstrumentMasterProvider();
    const instruments = await provider.fetchInstruments();
    expect(new Set(instruments.map((i) => i.token)).size).toBe(
      instruments.length,
    );
    expect(new Set(instruments.map((i) => i.tradingSymbol)).size).toBe(
      instruments.length,
    );
  });

  it('serves a BANKNIFTY 56800 PE contract (regression: atmStrike was stale at 52000, making this real-world strike unresolvable)', async () => {
    const provider = new MockInstrumentMasterProvider();
    const instruments = await provider.fetchInstruments();
    const contract = instruments.find(
      (i) =>
        i.name === 'BANKNIFTY' &&
        i.strike === 56800 &&
        i.optionType === OptionType.PE,
    );

    expect(contract).toBeDefined();
    expect(contract?.exchange).toBe('NFO');
    expect(contract?.segment).toBe('OPTIDX');
  });

  it('serves a BANKNIFTY 56800 CE contract alongside the PE at the same strike', async () => {
    const provider = new MockInstrumentMasterProvider();
    const instruments = await provider.fetchInstruments();
    const contract = instruments.find(
      (i) =>
        i.name === 'BANKNIFTY' &&
        i.strike === 56800 &&
        i.optionType === OptionType.CE,
    );

    expect(contract).toBeDefined();
    expect(contract?.exchange).toBe('NFO');
    expect(contract?.segment).toBe('OPTIDX');
  });

  it('serves a consistent, positive lot size for every BANKNIFTY contract, matching the configured seed value', async () => {
    const provider = new MockInstrumentMasterProvider();
    const instruments = await provider.fetchInstruments();
    const bankniftyContracts = instruments.filter(
      (i) => i.name === 'BANKNIFTY',
    );

    expect(bankniftyContracts.length).toBeGreaterThan(0);
    const lotSizes = new Set(bankniftyContracts.map((i) => i.lotSize));
    // Every BANKNIFTY contract (every strike/expiry/optionType) shares one
    // lot size — the field is per-underlying, not per-contract, so a mixed
    // set here would itself be a data-generation bug.
    expect(lotSizes).toEqual(new Set([15]));
  });

  it('includes BANKNIFTY, CRUDEOIL underlyings alongside SENSEX/NIFTY', async () => {
    const provider = new MockInstrumentMasterProvider();
    const instruments = await provider.fetchInstruments();
    const underlyings = new Set(instruments.map((i) => i.name));
    expect(underlyings.has('BANKNIFTY')).toBe(true);
    expect(underlyings.has('CRUDEOIL')).toBe(true);
  });
});
