import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FeatureFlagsService } from '@core/feature-flags/feature-flag.service';
import { RecoveryCoordinator } from './recovery-coordinator.service';
import { RecoveryScheduler } from './recovery-scheduler.service';
import { STARTUP_RECOVERY_ENABLED_FLAG } from './recovery.constants';

/**
 * Integrates Recovery into bootstrap (Part "Startup Integration" of the
 * Phase 9 spec). Nest awaits every module's `onModuleInit` — in DI-dependency
 * order — before `NestFactory.create(AppModule)` resolves and `main.ts`
 * proceeds to `app.listen()`. Running the full recovery flow here therefore
 * guarantees it completes (or definitively fails) before the app starts
 * serving traffic, and — since nothing in this codebase calls
 * `MarketDataService.start()` automatically except this flow itself and
 * SchedulerModule's MorningStartupJob — before any tick could ever reach the
 * Trading Engine.
 *
 * Gated behind STARTUP_RECOVERY_ENABLED (default disabled, same as every
 * other automation flag in this system — AUTOMATIC_RECOVERY,
 * SCHEDULER_ENABLED, MORNING_STARTUP_ENABLED, etc.) so `npm start`/e2e boots
 * never make a real broker/network call merely because the process started;
 * once an operator enables the flag, recovery genuinely runs automatically —
 * no manual `POST /recovery/start` call is ever required again.
 */
@Injectable()
export class RecoveryBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(RecoveryBootstrapService.name);

  constructor(
    private readonly coordinator: RecoveryCoordinator,
    private readonly scheduler: RecoveryScheduler,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled = await this.featureFlagsService.isEnabled(
      STARTUP_RECOVERY_ENABLED_FLAG,
    );
    if (!enabled) {
      return;
    }

    try {
      const result = await this.coordinator.run({ resume: true });
      if (result.succeeded) {
        this.scheduler.start();
      } else {
        this.logger.error(
          `Startup recovery failed at step ${result.failedStep ?? 'unknown'}: ${result.failureReason ?? 'unknown reason'}`,
        );
      }
    } catch (error) {
      // Defense in depth: RecoveryCoordinator.run() is documented to always
      // resolve rather than reject, but a bootstrap hook must never be the
      // reason the entire application fails to start — an unexpected
      // failure here is logged, never rethrown.
      this.logger.error(
        `Startup recovery threw unexpectedly: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
