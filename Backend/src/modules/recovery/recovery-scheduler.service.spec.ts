import type { PositionReconciliationService } from '@modules/position-reconciliation/position-reconciliation.service';
import { RecoveryScheduler } from './recovery-scheduler.service';
import { FakeTimerScheduler } from './testing/fake-timer-scheduler';
import { DEFAULT_RECOVERY_CONFIG } from './models/recovery-config.model';

describe('RecoveryScheduler', () => {
  let scheduler: FakeTimerScheduler;
  let positionReconciliationService: jest.Mocked<
    Pick<PositionReconciliationService, 'reconcile'>
  >;
  let recoveryScheduler: RecoveryScheduler;

  beforeEach(() => {
    scheduler = new FakeTimerScheduler();
    positionReconciliationService = {
      reconcile: jest.fn().mockResolvedValue([]),
    };
    recoveryScheduler = new RecoveryScheduler(
      positionReconciliationService as unknown as PositionReconciliationService,
      scheduler,
      DEFAULT_RECOVERY_CONFIG,
    );
  });

  it('is not running until start() is called', () => {
    expect(recoveryScheduler.isRunning()).toBe(false);
    expect(scheduler.pendingIntervalCount()).toBe(0);
  });

  it('start() registers a periodic interval', () => {
    recoveryScheduler.start();
    expect(recoveryScheduler.isRunning()).toBe(true);
    expect(scheduler.pendingIntervalCount()).toBe(1);
  });

  it('start() is idempotent', () => {
    recoveryScheduler.start();
    recoveryScheduler.start();
    expect(scheduler.pendingIntervalCount()).toBe(1);
  });

  it('firing the interval triggers Position Reconciliation', () => {
    recoveryScheduler.start();
    scheduler.fireAllIntervals();
    expect(positionReconciliationService.reconcile).toHaveBeenCalled();
  });

  it('stop() clears the interval', () => {
    recoveryScheduler.start();
    recoveryScheduler.stop();
    expect(recoveryScheduler.isRunning()).toBe(false);
    expect(scheduler.pendingIntervalCount()).toBe(0);
  });

  it('onModuleDestroy() stops the interval', () => {
    recoveryScheduler.start();
    recoveryScheduler.onModuleDestroy();
    expect(scheduler.pendingIntervalCount()).toBe(0);
  });
});
