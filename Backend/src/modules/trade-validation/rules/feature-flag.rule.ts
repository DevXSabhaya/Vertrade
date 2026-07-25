import { Inject, Injectable } from '@nestjs/common';
import { Result } from '@shared/types/result';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { ConfigService } from '@core/config/config.service';
import { FeatureFlagsService } from '@core/feature-flags/feature-flag.service';
import type { IValidationRule } from '../interfaces/validation-rule.interface';
import type { ValidationFailure } from '../models/validation-failure.model';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { buildValidationFailure } from '../models/build-validation-failure.util';

const TRADING_FEATURE_FLAG_NAME = 'TRADING_ENABLED';

/**
 * Step 10 (final): the Global Kill Switch (Part 14) — a static, per-process
 * ConfigService/env-var flag, checked first since it must reject instantly
 * without a database round-trip — followed by the runtime-toggleable
 * TRADING_ENABLED feature flag (Phase 0's FeatureFlagsService, its first
 * real consumer).
 */
@Injectable()
export class FeatureFlagRule implements IValidationRule {
  readonly name = 'FeatureFlagRule';

  constructor(
    private readonly configService: ConfigService,
    private readonly featureFlagsService: FeatureFlagsService,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async validate(): Promise<Result<void, ValidationFailure>> {
    if (this.configService.killSwitchEnabled) {
      return this.fail(
        'The global kill switch is enabled: no new trades are accepted',
      );
    }

    const tradingEnabled = await this.featureFlagsService.isEnabled(
      TRADING_FEATURE_FLAG_NAME,
    );
    if (!tradingEnabled) {
      return this.fail(
        `The ${TRADING_FEATURE_FLAG_NAME} feature flag is disabled`,
      );
    }

    return Result.ok(undefined);
  }

  private fail(message: string): Result<void, ValidationFailure> {
    return Result.fail(
      buildValidationFailure(
        ValidationFailureCode.FEATURE_DISABLED,
        message,
        this.name,
        this.clock,
      ),
    );
  }
}
