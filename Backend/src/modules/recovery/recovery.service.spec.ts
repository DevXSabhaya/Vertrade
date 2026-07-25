import { RecoveryService } from './recovery.service';
import type { RecoveryCoordinator } from './recovery-coordinator.service';
import type { RecoverySnapshotService } from './recovery-snapshot.service';
import { FakeClock } from './testing/fake-clock';
import { FakeRecoveryHistoryRepository } from './testing/fake-recovery-history-repository';
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
    durationMs: 5,
    failureReason: null,
    failedStep: null,
    stepsCompleted: [],
    tradesRecovered: 0,
    queueItemsRecovered: 0,
    ...overrides,
  };
}

describe('RecoveryService', () => {
  let coordinator: jest.Mocked<
    Pick<RecoveryCoordinator, 'run' | 'isRunning' | 'currentState'>
  >;
  let historyRepository: FakeRecoveryHistoryRepository;
  let snapshotService: jest.Mocked<
    Pick<RecoverySnapshotService, 'loadLatestSnapshot'>
  >;
  let service: RecoveryService;

  beforeEach(() => {
    coordinator = {
      run: jest.fn().mockResolvedValue(historyEntry()),
      isRunning: jest.fn().mockReturnValue(false),
      currentState: jest.fn().mockReturnValue(RecoveryState.IDLE),
    };
    historyRepository = new FakeRecoveryHistoryRepository();
    snapshotService = { loadLatestSnapshot: jest.fn().mockResolvedValue(null) };
    service = new RecoveryService(
      coordinator as unknown as RecoveryCoordinator,
      snapshotService as unknown as RecoverySnapshotService,
      historyRepository,
      new FakeClock(),
    );
  });

  it('start() runs a fresh (non-resumed) recovery', async () => {
    await service.start();
    expect(coordinator.run).toHaveBeenCalledWith({ resume: false });
  });

  it('restart() runs a resumed recovery', async () => {
    await service.restart();
    expect(coordinator.run).toHaveBeenCalledWith({ resume: true });
  });

  it('getStatus() reflects the coordinator state and last outcome', async () => {
    coordinator.currentState.mockReturnValue(RecoveryState.COMPLETED);
    coordinator.isRunning.mockReturnValue(false);
    await service.start();

    const status = service.getStatus();
    expect(status.state).toBe(RecoveryState.COMPLETED);
    expect(status.isRunning).toBe(false);
    expect(status.lastError).toBeNull();
  });

  it('getStatus() surfaces the failure reason after a failed run', async () => {
    coordinator.run.mockResolvedValue(
      historyEntry({ succeeded: false, failureReason: 'broker down' }),
    );
    await service.start();

    expect(service.getStatus().lastError).toBe('broker down');
  });

  it('getHistory() delegates to the history repository', async () => {
    historyRepository.seed(historyEntry({ id: 'h1' }));
    const history = await service.getHistory();
    expect(history.map((h) => h.id)).toEqual(['h1']);
  });

  it('getLatestSnapshot() delegates to the snapshot service', async () => {
    await service.getLatestSnapshot();
    expect(snapshotService.loadLatestSnapshot).toHaveBeenCalled();
  });
});
