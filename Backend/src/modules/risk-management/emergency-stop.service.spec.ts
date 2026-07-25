import type { IEmergencyStopStateRepository } from './interfaces/emergency-stop-state-repository.interface';
import { EmergencyStopService } from './emergency-stop.service';
import type { KillSwitchService } from './kill-switch.service';
import type { CooldownService } from './cooldown.service';
import type { RiskPolicyService } from './risk-policy.service';
import type { RiskEventPublisher } from './risk-event-publisher';
import { KillSwitchStatus } from './models/kill-switch-status.enum';
import { CooldownReason } from './models/cooldown.model';
import { DEFAULT_RISK_POLICY } from './models/risk-policy.model';
import type { EmergencyStopState } from './models/emergency-stop-state.model';
import { FakeClock } from './testing/fake-clock';

function repository(
  persisted: EmergencyStopState | null = null,
): jest.Mocked<IEmergencyStopStateRepository> {
  return {
    find: jest.fn().mockResolvedValue(persisted),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function killSwitchService(): jest.Mocked<Pick<KillSwitchService, 'activate'>> {
  return { activate: jest.fn().mockResolvedValue(undefined) };
}

function cooldownService(): jest.Mocked<Pick<CooldownService, 'start'>> {
  return { start: jest.fn().mockResolvedValue(null) };
}

function riskPolicyService(
  overrides: Partial<typeof DEFAULT_RISK_POLICY> = {},
): RiskPolicyService {
  return {
    getPolicy: jest
      .fn()
      .mockReturnValue({ ...DEFAULT_RISK_POLICY, ...overrides }),
  } as unknown as RiskPolicyService;
}

function eventPublisher(): jest.Mocked<
  Pick<RiskEventPublisher, 'emergencyStopActivated' | 'emergencyStopReset'>
> {
  return { emergencyStopActivated: jest.fn(), emergencyStopReset: jest.fn() };
}

describe('EmergencyStopService', () => {
  it('defaults to inactive when nothing is persisted', async () => {
    const service = new EmergencyStopService(
      repository(null),
      new FakeClock(),
      killSwitchService() as unknown as KillSwitchService,
      cooldownService() as unknown as CooldownService,
      riskPolicyService(),
      eventPublisher() as unknown as RiskEventPublisher,
    );
    await service.load();
    expect(service.isActive()).toBe(false);
  });

  it('trigger() activates, persists, publishes the event, engages the kill switch, and starts a cooldown', async () => {
    const repo = repository(null);
    const kill = killSwitchService();
    const cooldown = cooldownService();
    const publisher = eventPublisher();
    const service = new EmergencyStopService(
      repo,
      new FakeClock(),
      kill as unknown as KillSwitchService,
      cooldown as unknown as CooldownService,
      riskPolicyService({
        killSwitchForceExitsPositions: true,
        cooldownAfterEmergencyExitMs: 3_600_000,
      }),
      publisher as unknown as RiskEventPublisher,
    );
    await service.load();

    const state = await service.trigger('broker unavailable', 'system');

    expect(state.active).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, reason: 'broker unavailable' }),
    );
    expect(publisher.emergencyStopActivated).toHaveBeenCalledWith(
      'broker unavailable',
      'system',
    );
    expect(kill.activate).toHaveBeenCalledWith(
      KillSwitchStatus.EMERGENCY_STOP,
      'broker unavailable',
      'system',
      true,
    );
    expect(cooldown.start).toHaveBeenCalledWith(
      CooldownReason.EMERGENCY_EXIT,
      3_600_000,
    );
  });

  it('is idempotent: triggering while already active does not re-run protective actions', async () => {
    const kill = killSwitchService();
    const publisher = eventPublisher();
    const service = new EmergencyStopService(
      repository(null),
      new FakeClock(),
      kill as unknown as KillSwitchService,
      cooldownService() as unknown as CooldownService,
      riskPolicyService(),
      publisher as unknown as RiskEventPublisher,
    );
    await service.load();

    await service.trigger('first reason', 'system');
    await service.trigger('second reason', 'system');

    expect(kill.activate).toHaveBeenCalledTimes(1);
    expect(publisher.emergencyStopActivated).toHaveBeenCalledTimes(1);
    expect(service.getState().reason).toBe('first reason');
  });

  it('reset() clears active state, persists, and publishes the event without touching the kill switch', async () => {
    const kill = killSwitchService();
    const publisher = eventPublisher();
    const service = new EmergencyStopService(
      repository(null),
      new FakeClock(),
      kill as unknown as KillSwitchService,
      cooldownService() as unknown as CooldownService,
      riskPolicyService(),
      publisher as unknown as RiskEventPublisher,
    );
    await service.load();
    await service.trigger('reason', 'system');

    const reset = await service.reset('operator');

    expect(reset.active).toBe(false);
    expect(service.isActive()).toBe(false);
    expect(publisher.emergencyStopReset).toHaveBeenCalledWith('operator');
    // Resetting emergency stop must never itself call KillSwitchService.activate/deactivate.
    expect(kill.activate).toHaveBeenCalledTimes(1);
  });

  it('reset() is idempotent when not active', async () => {
    const publisher = eventPublisher();
    const service = new EmergencyStopService(
      repository(null),
      new FakeClock(),
      killSwitchService() as unknown as KillSwitchService,
      cooldownService() as unknown as CooldownService,
      riskPolicyService(),
      publisher as unknown as RiskEventPublisher,
    );
    await service.load();

    await service.reset('operator');

    expect(publisher.emergencyStopReset).not.toHaveBeenCalled();
  });
});
