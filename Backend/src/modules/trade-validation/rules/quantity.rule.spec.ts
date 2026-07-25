import { QuantityRule } from './quantity.rule';
import { ValidationContext } from '../models/validation-context';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { FakeClock } from '../testing/fake-clock';
import {
  buildResolvedInstrument,
  buildValidationRequest,
} from '../testing/build-request';

describe('QuantityRule', () => {
  const rule = new QuantityRule(new FakeClock());

  it('passes a positive integer quantity with no known lot size', async () => {
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest({ quantity: 50 })),
    );
    expect(result.isSuccess).toBe(true);
  });

  it('rejects zero or negative quantity', async () => {
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest({ quantity: 0 })),
    );
    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe(ValidationFailureCode.INVALID_QUANTITY);
  });

  it('rejects a non-integer quantity', async () => {
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest({ quantity: 12.5 })),
    );
    expect(result.isFailure).toBe(true);
  });

  it('rejects a quantity that is not a multiple of the lot size', async () => {
    const context = new ValidationContext(
      buildValidationRequest({ quantity: 51 }),
    );
    context.resolvedInstrument = buildResolvedInstrument({ lotSize: 50 });

    const result = await rule.validate(context);
    expect(result.isFailure).toBe(true);
  });

  it('passes a quantity that is an exact multiple of the lot size', async () => {
    const context = new ValidationContext(
      buildValidationRequest({ quantity: 150 }),
    );
    context.resolvedInstrument = buildResolvedInstrument({ lotSize: 50 });

    const result = await rule.validate(context);
    expect(result.isSuccess).toBe(true);
  });
});
