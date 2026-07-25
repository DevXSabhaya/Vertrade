import type { ConfigService } from '@core/config/config.service';
import type { FeatureFlagsService } from '@core/feature-flags/feature-flag.service';
import { FeatureFlagRule } from './feature-flag.rule';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { FakeClock } from '../testing/fake-clock';

function configService(killSwitchEnabled: boolean): ConfigService {
  return { killSwitchEnabled } as unknown as ConfigService;
}

function featureFlagsService(enabled: boolean): FeatureFlagsService {
  return {
    isEnabled: jest.fn().mockResolvedValue(enabled),
  } as unknown as FeatureFlagsService;
}

describe('FeatureFlagRule', () => {
  it('passes when the kill switch is off and TRADING_ENABLED is on', async () => {
    const rule = new FeatureFlagRule(
      configService(false),
      featureFlagsService(true),
      new FakeClock(),
    );
    const result = await rule.validate();
    expect(result.isSuccess).toBe(true);
  });

  it('fails immediately when the kill switch is enabled, without checking the feature flag', async () => {
    const flags = featureFlagsService(true);
    const rule = new FeatureFlagRule(
      configService(true),
      flags,
      new FakeClock(),
    );

    const result = await rule.validate();

    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe(ValidationFailureCode.FEATURE_DISABLED);
    expect(flags.isEnabled).not.toHaveBeenCalled();
  });

  it('fails when TRADING_ENABLED is disabled', async () => {
    const rule = new FeatureFlagRule(
      configService(false),
      featureFlagsService(false),
      new FakeClock(),
    );
    const result = await rule.validate();
    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe(ValidationFailureCode.FEATURE_DISABLED);
  });
});
