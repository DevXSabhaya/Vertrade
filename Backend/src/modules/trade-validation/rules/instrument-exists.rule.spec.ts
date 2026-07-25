import type { InstrumentResolverService } from '@modules/instrument-resolver/instrument-resolver.service';
import { UnknownSymbolException } from '@modules/instrument-resolver/exceptions/unknown-symbol.exception';
import { InstrumentExistsRule } from './instrument-exists.rule';
import { ValidationContext } from '../models/validation-context';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { FakeClock } from '../testing/fake-clock';
import {
  buildResolvedInstrument,
  buildValidationRequest,
} from '../testing/build-request';

describe('InstrumentExistsRule', () => {
  it('attaches the resolved instrument to the context on success', async () => {
    const resolved = buildResolvedInstrument();
    const resolver = {
      resolve: jest.fn().mockReturnValue(resolved),
    } as unknown as InstrumentResolverService;
    const rule = new InstrumentExistsRule(resolver, new FakeClock());
    const context = new ValidationContext(buildValidationRequest());

    const result = await rule.validate(context);

    expect(result.isSuccess).toBe(true);
    expect(context.resolvedInstrument).toBe(resolved);
  });

  it('fails with INSTRUMENT_NOT_FOUND when the resolver throws', async () => {
    const resolver = {
      resolve: jest.fn().mockImplementation(() => {
        throw new UnknownSymbolException('No such symbol');
      }),
    } as unknown as InstrumentResolverService;
    const rule = new InstrumentExistsRule(resolver, new FakeClock());
    const context = new ValidationContext(
      buildValidationRequest({ rawSymbol: 'GARBAGE' }),
    );

    const result = await rule.validate(context);

    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe(ValidationFailureCode.INSTRUMENT_NOT_FOUND);
    expect(context.resolvedInstrument).toBeUndefined();
  });
});
