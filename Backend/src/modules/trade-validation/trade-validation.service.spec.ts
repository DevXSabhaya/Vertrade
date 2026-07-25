import { Result } from '@shared/types/result';
import { TradeValidationService } from './trade-validation.service';
import { RuleRegistry } from './rule-registry';
import type { IValidationRule } from './interfaces/validation-rule.interface';
import type { ValidationContext } from './models/validation-context';
import type { ValidationFailure } from './models/validation-failure.model';
import { ValidationFailureCode } from './models/validation-failure-code.enum';
import {
  buildResolvedInstrument,
  buildValidationRequest,
} from './testing/build-request';

function passingRule(
  name: string,
  onRun?: (context: ValidationContext) => void,
): IValidationRule {
  return {
    name,
    validate: jest.fn((context: ValidationContext) => {
      onRun?.(context);
      return Promise.resolve(Result.ok(undefined));
    }),
  };
}

function failingRule(name: string): IValidationRule {
  const failure: ValidationFailure = {
    code: ValidationFailureCode.INVALID_QUANTITY,
    reason: ValidationFailureCode.INVALID_QUANTITY,
    message: `${name} failed`,
    failedRule: name,
    timestamp: new Date().toISOString(),
  };
  return {
    name,
    validate: jest.fn(() => Promise.resolve(Result.fail(failure))),
  };
}

describe('TradeValidationService', () => {
  it('returns Valid with the resolved instrument when every rule passes', async () => {
    const resolved = buildResolvedInstrument();
    const rules = [
      passingRule('A', (ctx) => {
        ctx.resolvedInstrument = resolved;
      }),
      passingRule('B'),
    ];
    const service = new TradeValidationService(new RuleRegistry(rules));

    const result = await service.validate(buildValidationRequest());

    expect(result.isValid).toBe(true);
    expect(result.resolvedInstrument).toBe(resolved);
  });

  it('stops at the first failing rule and does not run subsequent rules', async () => {
    const ruleA = passingRule('A');
    const ruleB = failingRule('B');
    const ruleC = passingRule('C');
    const service = new TradeValidationService(
      new RuleRegistry([ruleA, ruleB, ruleC]),
    );

    const result = await service.validate(buildValidationRequest());

    expect(result.isValid).toBe(false);
    expect(result.failure?.failedRule).toBe('B');
    expect(ruleA.validate).toHaveBeenCalled();
    expect(ruleB.validate).toHaveBeenCalled();
    expect(ruleC.validate).not.toHaveBeenCalled();
  });

  it('runs rules in exactly the order the registry provides', async () => {
    const callOrder: string[] = [];
    const rules = ['A', 'B', 'C'].map((name) =>
      passingRule(name, () => callOrder.push(name)),
    );
    const service = new TradeValidationService(new RuleRegistry(rules));

    await service.validate(buildValidationRequest());

    expect(callOrder).toEqual(['A', 'B', 'C']);
  });
});
