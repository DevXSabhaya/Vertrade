import { EntryPriceRule } from './entry-price.rule';
import { ValidationContext } from '../models/validation-context';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { FakeClock } from '../testing/fake-clock';
import { buildValidationRequest } from '../testing/build-request';

describe('EntryPriceRule', () => {
  const rule = new EntryPriceRule(new FakeClock());

  it('passes a positive entry price', async () => {
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest({ entryTriggerPrice: 100 })),
    );
    expect(result.isSuccess).toBe(true);
  });

  it('rejects a zero or negative entry price', async () => {
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest({ entryTriggerPrice: 0 })),
    );
    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe(ValidationFailureCode.INVALID_ENTRY_PRICE);
  });

  it('rejects a non-finite entry price', async () => {
    const result = await rule.validate(
      new ValidationContext(
        buildValidationRequest({ entryTriggerPrice: Infinity }),
      ),
    );
    expect(result.isFailure).toBe(true);
  });
});
