import type { RiskPolicyService } from './risk-policy.service';
import type { RiskSnapshotService } from './risk-snapshot.service';
import type { CooldownService } from './cooldown.service';
import type { KillSwitchService } from './kill-switch.service';
import type { EmergencyStopService } from './emergency-stop.service';
import type { CircuitBreakerService } from './circuit-breaker.service';
import type { IRiskEventRepository } from './interfaces/risk-event-repository.interface';
import type { IRiskViolationRepository } from './interfaces/risk-violation-repository.interface';
import { RiskManagementController } from './risk-management.controller';
import { KillSwitchStatus } from './models/kill-switch-status.enum';
import { DEFAULT_RISK_POLICY } from './models/risk-policy.model';
import { CooldownReason } from './models/cooldown.model';
import { FakeClock } from './testing/fake-clock';

function build(
  options: {
    killSwitchStatus?: KillSwitchStatus;
    emergencyStopActive?: boolean;
    cooldown?: {
      reason: CooldownReason;
      startedAt: string;
      expiresAt: string;
    } | null;
  } = {},
) {
  const riskPolicyService = {
    getPolicy: jest.fn().mockReturnValue(DEFAULT_RISK_POLICY),
    updatePolicy: jest
      .fn()
      .mockImplementation((patch) =>
        Promise.resolve({ ...DEFAULT_RISK_POLICY, ...patch }),
      ),
  } as unknown as jest.Mocked<RiskPolicyService>;
  const riskSnapshotService = {
    compose: jest.fn().mockResolvedValue({ asOf: new Date().toISOString() }),
  } as unknown as jest.Mocked<RiskSnapshotService>;
  const cooldownService = {
    getActiveCooldown: jest.fn().mockResolvedValue(options.cooldown ?? null),
  } as unknown as jest.Mocked<CooldownService>;
  const killSwitchService = {
    getState: jest.fn().mockReturnValue({
      status: options.killSwitchStatus ?? KillSwitchStatus.ACTIVE,
    }),
    activate: jest
      .fn()
      .mockResolvedValue({ status: KillSwitchStatus.TRADING_DISABLED }),
    deactivate: jest
      .fn()
      .mockResolvedValue({ status: KillSwitchStatus.ACTIVE }),
  } as unknown as jest.Mocked<KillSwitchService>;
  const emergencyStopService = {
    isActive: jest.fn().mockReturnValue(options.emergencyStopActive ?? false),
    trigger: jest.fn().mockResolvedValue({ active: true }),
    reset: jest.fn().mockResolvedValue({ active: false }),
  } as unknown as jest.Mocked<EmergencyStopService>;
  const circuitBreakerService = {
    getAllSnapshots: jest.fn().mockReturnValue([]),
  } as unknown as jest.Mocked<CircuitBreakerService>;
  const riskEventRepository = {
    save: jest.fn(),
    findRecent: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<IRiskEventRepository>;
  const riskViolationRepository = {
    save: jest.fn(),
    findRecent: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<IRiskViolationRepository>;

  const controller = new RiskManagementController(
    riskPolicyService,
    riskSnapshotService,
    cooldownService,
    killSwitchService,
    emergencyStopService,
    circuitBreakerService,
    riskEventRepository,
    riskViolationRepository,
    new FakeClock(),
  );

  return {
    controller,
    riskPolicyService,
    riskSnapshotService,
    cooldownService,
    killSwitchService,
    emergencyStopService,
    riskEventRepository,
    riskViolationRepository,
  };
}

describe('RiskManagementController', () => {
  it('GET /risk/status reports tradingBlocked=false when nothing is active', async () => {
    const { controller } = build();
    const status = await controller.getStatus();
    expect(status.tradingBlocked).toBe(false);
    expect(status.killSwitchStatus).toBe(KillSwitchStatus.ACTIVE);
  });

  it('GET /risk/status reports tradingBlocked=true when the kill switch is engaged', async () => {
    const { controller } = build({
      killSwitchStatus: KillSwitchStatus.TRADING_DISABLED,
    });
    const status = await controller.getStatus();
    expect(status.tradingBlocked).toBe(true);
  });

  it('GET /risk/status reports tradingBlocked=true when emergency stop is active', async () => {
    const { controller } = build({ emergencyStopActive: true });
    const status = await controller.getStatus();
    expect(status.tradingBlocked).toBe(true);
  });

  it('GET /risk/status reports tradingBlocked=true when a cooldown is active', async () => {
    const { controller } = build({
      cooldown: {
        reason: CooldownReason.STOP_LOSS_HIT,
        startedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      },
    });
    const status = await controller.getStatus();
    expect(status.tradingBlocked).toBe(true);
    expect(status.cooldownActive).toBe(true);
  });

  it('GET /risk/snapshot delegates to RiskSnapshotService.compose', async () => {
    const { controller, riskSnapshotService } = build();
    await controller.getSnapshot();
    expect(riskSnapshotService.compose).toHaveBeenCalledTimes(1);
  });

  it('GET /risk/policy and GET /risk/limits both return the current policy', () => {
    const { controller } = build();
    expect(controller.getPolicy()).toEqual(DEFAULT_RISK_POLICY);
    expect(controller.getLimits()).toEqual(DEFAULT_RISK_POLICY);
  });

  it('PUT /risk/policy merges the patch via RiskPolicyService.updatePolicy', async () => {
    const { controller, riskPolicyService } = build();
    const updated = await controller.updatePolicy({ maxOpenTrades: 5 });
    expect(riskPolicyService.updatePolicy).toHaveBeenCalledWith({
      maxOpenTrades: 5,
    });
    expect(updated.maxOpenTrades).toBe(5);
  });

  it('GET /risk/cooldown returns the active cooldown', async () => {
    const { controller } = build();
    expect(await controller.getCooldown()).toBeNull();
  });

  it('POST /risk/kill-switch/activate defaults activatedBy to "api" and forceExitPositions to false', async () => {
    const { controller, killSwitchService } = build();
    await controller.activateKillSwitch({
      status: KillSwitchStatus.TRADING_DISABLED,
      reason: 'manual',
    });
    expect(killSwitchService.activate).toHaveBeenCalledWith(
      KillSwitchStatus.TRADING_DISABLED,
      'manual',
      'api',
      false,
    );
  });

  it('POST /risk/kill-switch/deactivate defaults deactivatedBy to "api"', async () => {
    const { controller, killSwitchService } = build();
    await controller.deactivateKillSwitch({});
    expect(killSwitchService.deactivate).toHaveBeenCalledWith('api');
  });

  it('POST /risk/emergency-stop defaults triggeredBy to "api"', async () => {
    const { controller, emergencyStopService } = build();
    await controller.triggerEmergencyStop({ reason: 'manual trigger' });
    expect(emergencyStopService.trigger).toHaveBeenCalledWith(
      'manual trigger',
      'api',
    );
  });

  it('POST /risk/emergency-stop/reset defaults resetBy to "api"', async () => {
    const { controller, emergencyStopService } = build();
    await controller.resetEmergencyStop({});
    expect(emergencyStopService.reset).toHaveBeenCalledWith('api');
  });

  it('GET /risk/events uses the default limit when none is supplied', async () => {
    const { controller, riskEventRepository } = build();
    await controller.getEvents();
    expect(riskEventRepository.findRecent).toHaveBeenCalledWith(50);
  });

  it('GET /risk/events honors an explicit limit query parameter', async () => {
    const { controller, riskEventRepository } = build();
    await controller.getEvents('10');
    expect(riskEventRepository.findRecent).toHaveBeenCalledWith(10);
  });

  it('GET /risk/violations uses the default limit when none is supplied', async () => {
    const { controller, riskViolationRepository } = build();
    await controller.getViolations();
    expect(riskViolationRepository.findRecent).toHaveBeenCalledWith(50);
  });
});
