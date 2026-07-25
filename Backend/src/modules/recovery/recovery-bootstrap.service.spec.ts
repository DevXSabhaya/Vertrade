import type { FeatureFlagsService } from '@core/feature-flags/feature-flag.service';
import { RecoveryBootstrapService } from './recovery-bootstrap.service';
import type { RecoveryCoordinator } from './recovery-coordinator.service';
import type { RecoveryScheduler } from './recovery-scheduler.service';
import { STARTUP_RECOVERY_ENABLED_FLAG } from './recovery.constants';
import { RecoveryState } from './models/recovery-state.enum';
import type { RecoveryHistoryEntry } from './models/recovery-history-entry.model';

function historyEntry(
  overrides: Partial<RecoveryHistoryEntry> = {},
): RecoveryHistoryEntry {
  return {
    id: 'r1',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    succeeded: true,
    finalState: RecoveryState.COMPLETED,
    durationMs: 10,
    failureReason: null,
    failedStep: null,
    stepsCompleted: [],
    tradesRecovered: 0,
    queueItemsRecovered: 0,
    ...overrides,
  };
}

describe('RecoveryBootstrapService', () => {
  let coordinator: jest.Mocked<Pick<RecoveryCoordinator, 'run'>>;
  let scheduler: jest.Mocked<Pick<RecoveryScheduler, 'start'>>;
  let featureFlagsService: jest.Mocked<Pick<FeatureFlagsService, 'isEnabled'>>;

  beforeEach(() => {
    coordinator = { run: jest.fn().mockResolvedValue(historyEntry()) };
    scheduler = { start: jest.fn() };
    featureFlagsService = { isEnabled: jest.fn().mockResolvedValue(false) };
  });

  function build(): RecoveryBootstrapService {
    return new RecoveryBootstrapService(
      coordinator as unknown as RecoveryCoordinator,
      scheduler as unknown as RecoveryScheduler,
      featureFlagsService as unknown as FeatureFlagsService,
    );
  }

  it('does nothing when STARTUP_RECOVERY_ENABLED is disabled — no real network call at boot', async () => {
    await build().onModuleInit();

    expect(coordinator.run).not.toHaveBeenCalled();
    expect(scheduler.start).not.toHaveBeenCalled();
  });

  it('checks the correct feature flag name', async () => {
    await build().onModuleInit();
    expect(featureFlagsService.isEnabled).toHaveBeenCalledWith(
      STARTUP_RECOVERY_ENABLED_FLAG,
    );
  });

  it('runs recovery in resumable mode and starts the periodic scheduler on success', async () => {
    featureFlagsService.isEnabled.mockResolvedValue(true);

    await build().onModuleInit();

    expect(coordinator.run).toHaveBeenCalledWith({ resume: true });
    expect(scheduler.start).toHaveBeenCalled();
  });

  it('does not start the periodic scheduler when recovery fails', async () => {
    featureFlagsService.isEnabled.mockResolvedValue(true);
    coordinator.run.mockResolvedValue(historyEntry({ succeeded: false }));

    await build().onModuleInit();

    expect(scheduler.start).not.toHaveBeenCalled();
  });

  it('never throws even if the coordinator run rejects unexpectedly — onModuleInit must never crash app bootstrap', async () => {
    featureFlagsService.isEnabled.mockResolvedValue(true);
    coordinator.run.mockRejectedValue(new Error('unexpected'));

    await expect(build().onModuleInit()).resolves.toBeUndefined();
    expect(scheduler.start).not.toHaveBeenCalled();
  });
});
