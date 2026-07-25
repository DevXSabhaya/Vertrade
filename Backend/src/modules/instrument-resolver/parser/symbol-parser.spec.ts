import { parseSymbolInput } from './symbol-parser';
import { OptionType } from '@modules/instrument-master/option-type.enum';
import { InvalidOptionTypeException } from '../exceptions/invalid-option-type.exception';
import { UnknownSymbolException } from '../exceptions/unknown-symbol.exception';

describe('parseSymbolInput', () => {
  it('parses a call option symbol', () => {
    expect(parseSymbolInput('Sensex 77200 CE')).toEqual({
      underlying: 'Sensex',
      strike: 77200,
      optionType: OptionType.CE,
    });
  });

  it('parses a put option symbol', () => {
    expect(parseSymbolInput('Nifty 24500 PE')).toEqual({
      underlying: 'Nifty',
      strike: 24500,
      optionType: OptionType.PE,
    });
  });

  it('is case-insensitive for the option type token', () => {
    expect(parseSymbolInput('Nifty 24500 ce').optionType).toBe(OptionType.CE);
  });

  it('parses a multi-word underlying with an option suffix', () => {
    const parsed = parseSymbolInput('Bank Nifty 55000 CE');
    expect(parsed.underlying).toBe('Bank Nifty');
    expect(parsed.strike).toBe(55000);
  });

  it('parses a plain underlying with no strike or option type', () => {
    expect(parseSymbolInput('BankNifty')).toEqual({
      underlying: 'BankNifty',
      strike: null,
      optionType: null,
    });
  });

  it('parses a plain multi-word underlying with no strike or option type', () => {
    expect(parseSymbolInput('Crude Oil')).toEqual({
      underlying: 'Crude Oil',
      strike: null,
      optionType: null,
    });
  });

  it('throws InvalidOptionTypeException when the option-type token is not CE/PE', () => {
    expect(() => parseSymbolInput('Sensex 77200 XX')).toThrow(
      InvalidOptionTypeException,
    );
  });

  it('throws UnknownSymbolException for empty input', () => {
    expect(() => parseSymbolInput('   ')).toThrow(UnknownSymbolException);
  });

  it('throws UnknownSymbolException when only a strike+option-type is given with no underlying', () => {
    expect(() => parseSymbolInput('77200 CE')).toThrow(UnknownSymbolException);
  });
});
