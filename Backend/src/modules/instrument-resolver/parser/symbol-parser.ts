import { OptionType } from '@modules/instrument-master/option-type.enum';
import { InvalidOptionTypeException } from '../exceptions/invalid-option-type.exception';
import { UnknownSymbolException } from '../exceptions/unknown-symbol.exception';

export interface ParsedSymbolInput {
  underlying: string;
  strike: number | null;
  optionType: OptionType | null;
}

const STRIKE_PATTERN = /^\d+(\.\d+)?$/;

/**
 * Parses a human-entered symbol like "Sensex 77200 CE" or "BankNifty" into its
 * component parts. Never guesses: an input that looks like an option attempt
 * but has an invalid option-type token fails loudly (InvalidOptionTypeException)
 * rather than being silently absorbed into the underlying name.
 */
export function parseSymbolInput(raw: string): ParsedSymbolInput {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    throw new UnknownSymbolException('Symbol input is empty');
  }

  const last = tokens[tokens.length - 1];
  const secondLast = tokens.length >= 2 ? tokens[tokens.length - 2] : undefined;
  const looksLikeStrikeAttempt =
    secondLast !== undefined && STRIKE_PATTERN.test(secondLast);

  if (looksLikeStrikeAttempt) {
    const upperLast = last.toUpperCase();
    if (upperLast !== 'CE' && upperLast !== 'PE') {
      throw new InvalidOptionTypeException(
        `"${last}" is not a valid option type — expected CE or PE`,
      );
    }

    const underlying = tokens
      .slice(0, tokens.length - 2)
      .join(' ')
      .trim();
    if (!underlying) {
      throw new UnknownSymbolException(
        'Missing underlying name before the strike and option type',
      );
    }

    return {
      underlying,
      strike: Number(secondLast),
      optionType: upperLast === 'CE' ? OptionType.CE : OptionType.PE,
    };
  }

  return { underlying: tokens.join(' '), strike: null, optionType: null };
}
