import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { RequiredFieldsRule } from './required-fields.rule';
import { ValidationContext } from '../models/validation-context';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { FakeClock } from '../testing/fake-clock';
import { buildValidationRequest } from '../testing/build-request';

describe('RequiredFieldsRule', () => {
  const rule = new RequiredFieldsRule(new FakeClock());

  it('passes a fully-populated request', async () => {
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest()),
    );
    expect(result.isSuccess).toBe(true);
  });

  it('rejects a blank rawSymbol', async () => {
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest({ rawSymbol: '  ' })),
    );
    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe(
      ValidationFailureCode.REQUIRED_FIELD_MISSING,
    );
    expect(result.error.failedRule).toBe('RequiredFieldsRule');
  });

  it('rejects a missing/invalid direction', async () => {
    const result = await rule.validate(
      new ValidationContext(
        buildValidationRequest({
          direction: 'SIDEWAYS' as unknown as TradeDirection,
        }),
      ),
    );
    expect(result.isFailure).toBe(true);
  });

  it('rejects a missing quantity', async () => {
    const result = await rule.validate(
      new ValidationContext(
        buildValidationRequest({ quantity: undefined as unknown as number }),
      ),
    );
    expect(result.isFailure).toBe(true);
  });

  it('rejects an empty targets array', async () => {
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest({ targets: [] })),
    );
    expect(result.isFailure).toBe(true);
  });

  it('includes a timestamp on failure', async () => {
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest({ rawSymbol: '' })),
    );
    expect(result.isFailure).toBe(true);
    expect(typeof result.error.timestamp).toBe('string');
    expect(new Date(result.error.timestamp).toString()).not.toBe(
      'Invalid Date',
    );
  });
});
