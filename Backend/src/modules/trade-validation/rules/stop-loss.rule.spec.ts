import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { StopLossRule } from './stop-loss.rule';
import { ValidationContext } from '../models/validation-context';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { FakeClock } from '../testing/fake-clock';
import { buildValidationRequest } from '../testing/build-request';

describe('StopLossRule', () => {
  const rule = new StopLossRule(new FakeClock());

  it('passes a LONG stop loss below the entry price', async () => {
    const result = await rule.validate(
      new ValidationContext(
        buildValidationRequest({
          direction: TradeDirection.LONG,
          entryTriggerPrice: 100,
          initialStopLoss: 95,
        }),
      ),
    );
    expect(result.isSuccess).toBe(true);
  });

  it('rejects a LONG stop loss at or above the entry price', async () => {
    const result = await rule.validate(
      new ValidationContext(
        buildValidationRequest({
          direction: TradeDirection.LONG,
          entryTriggerPrice: 100,
          initialStopLoss: 100,
        }),
      ),
    );
    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe(ValidationFailureCode.INVALID_STOP_LOSS);
  });

  it('passes a SHORT stop loss above the entry price', async () => {
    const result = await rule.validate(
      new ValidationContext(
        buildValidationRequest({
          direction: TradeDirection.SHORT,
          entryTriggerPrice: 100,
          initialStopLoss: 105,
        }),
      ),
    );
    expect(result.isSuccess).toBe(true);
  });

  it('rejects a SHORT stop loss at or below the entry price', async () => {
    const result = await rule.validate(
      new ValidationContext(
        buildValidationRequest({
          direction: TradeDirection.SHORT,
          entryTriggerPrice: 100,
          initialStopLoss: 100,
        }),
      ),
    );
    expect(result.isFailure).toBe(true);
  });

  it('rejects a non-positive stop loss', async () => {
    const result = await rule.validate(
      new ValidationContext(buildValidationRequest({ initialStopLoss: -5 })),
    );
    expect(result.isFailure).toBe(true);
  });
});
