import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TargetRule } from './target.rule';
import { ValidationContext } from '../models/validation-context';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { FakeClock } from '../testing/fake-clock';
import { buildValidationRequest } from '../testing/build-request';

describe('TargetRule', () => {
  const rule = new TargetRule(new FakeClock());

  it('passes strictly increasing LONG targets above the entry price', async () => {
    const result = await rule.validate(
      new ValidationContext(
        buildValidationRequest({
          direction: TradeDirection.LONG,
          entryTriggerPrice: 100,
          targets: [110, 120, 135],
        }),
      ),
    );
    expect(result.isSuccess).toBe(true);
  });

  it('rejects a LONG first target at or below the entry price', async () => {
    const result = await rule.validate(
      new ValidationContext(
        buildValidationRequest({
          direction: TradeDirection.LONG,
          entryTriggerPrice: 100,
          targets: [100, 120],
        }),
      ),
    );
    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe(ValidationFailureCode.INVALID_TARGETS);
  });

  it('rejects non-increasing LONG targets', async () => {
    const result = await rule.validate(
      new ValidationContext(
        buildValidationRequest({
          direction: TradeDirection.LONG,
          entryTriggerPrice: 100,
          targets: [110, 105],
        }),
      ),
    );
    expect(result.isFailure).toBe(true);
  });

  it('passes strictly decreasing SHORT targets below the entry price', async () => {
    const result = await rule.validate(
      new ValidationContext(
        buildValidationRequest({
          direction: TradeDirection.SHORT,
          entryTriggerPrice: 100,
          targets: [90, 80, 65],
        }),
      ),
    );
    expect(result.isSuccess).toBe(true);
  });

  it('rejects non-decreasing SHORT targets', async () => {
    const result = await rule.validate(
      new ValidationContext(
        buildValidationRequest({
          direction: TradeDirection.SHORT,
          entryTriggerPrice: 100,
          targets: [90, 95],
        }),
      ),
    );
    expect(result.isFailure).toBe(true);
  });

  it('rejects a non-positive target', async () => {
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest({ targets: [110, -5] })),
    );
    expect(result.isFailure).toBe(true);
  });

  it('supports an arbitrary number of targets (10)', async () => {
    const targets = Array.from({ length: 10 }, (_, i) => 101 + i);
    const result = await rule.validate(
      new ValidationContext(
        buildValidationRequest({
          direction: TradeDirection.LONG,
          entryTriggerPrice: 100,
          targets,
        }),
      ),
    );
    expect(result.isSuccess).toBe(true);
  });
});
