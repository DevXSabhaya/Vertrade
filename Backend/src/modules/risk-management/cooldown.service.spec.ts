import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { StopLossHitEvent } from '@modules/trading-engine/events/stop-loss-hit.event';
import type { ICooldownStateRepository } from './interfaces/cooldown-state-repository.interface';
import { CooldownService } from './cooldown.service';
import type { RiskPolicyService } from './risk-policy.service';
import type { RiskEventPublisher } from './risk-event-publisher';
import { CooldownReason, type CooldownState } from './models/cooldown.model';
import { DEFAULT_RISK_POLICY } from './models/risk-policy.model';
import { FakeClock } from './testing/fake-clock';

function repository(
  persisted: CooldownState | null = null,
): jest.Mocked<ICooldownStateRepository> {
  return {
    find: jest.fn().mockResolvedValue(persisted),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function riskPolicyService(cooldownAfterLossMs = 0): RiskPolicyService {
  return {
    getPolicy: jest
      .fn()
      .mockReturnValue({ ...DEFAULT_RISK_POLICY, cooldownAfterLossMs }),
  } as unknown as RiskPolicyService;
}

function eventPublisher(): jest.Mocked<
  Pick<RiskEventPublisher, 'cooldownStarted' | 'cooldownEnded'>
> {
  return { cooldownStarted: jest.fn(), cooldownEnded: jest.fn() };
}

function eventBus(): { bus: IEventBus; emit: (event: BaseEvent) => void } {
  const handlers: ((event: BaseEvent) => void)[] = [];
  return {
    bus: {
      publish: jest.fn(),
      subscribe: <T extends BaseEvent = BaseEvent>(
        _name: string,
        handler: (event: T) => void,
      ) => {
        handlers.push(handler as (event: BaseEvent) => void);
      },
      subscribeToAll: jest.fn(),
    },
    emit: (event) => handlers.forEach((h) => h(event)),
  };
}

describe('CooldownService', () => {
  it('returns null when no cooldown is active', async () => {
    const service = new CooldownService(
      repository(null),
      eventBus().bus,
      new FakeClock(),
      riskPolicyService(),
      eventPublisher() as unknown as RiskEventPublisher,
    );
    expect(await service.getActiveCooldown()).toBeNull();
  });

  it('starts a cooldown, persists it, and publishes CooldownStarted', async () => {
    const repo = repository(null);
    const publisher = eventPublisher();
    const clock = new FakeClock();
    const service = new CooldownService(
      repo,
      eventBus().bus,
      clock,
      riskPolicyService(),
      publisher as unknown as RiskEventPublisher,
    );

    const state = await service.start(CooldownReason.DAILY_LOSS, 60_000);

    expect(state).not.toBeNull();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: CooldownReason.DAILY_LOSS }),
    );
    expect(publisher.cooldownStarted).toHaveBeenCalledWith(
      CooldownReason.DAILY_LOSS,
      state?.expiresAt,
    );
  });

  it('does not start a cooldown when durationMs is 0 or negative', async () => {
    const repo = repository(null);
    const service = new CooldownService(
      repo,
      eventBus().bus,
      new FakeClock(),
      riskPolicyService(),
      eventPublisher() as unknown as RiskEventPublisher,
    );

    await service.start(CooldownReason.STOP_LOSS_HIT, 0);

    expect(repo.save).not.toHaveBeenCalled();
    expect(await service.getActiveCooldown()).toBeNull();
  });

  it('auto-expires a cooldown once its expiresAt has passed, publishing CooldownEnded', async () => {
    const clock = new FakeClock();
    const repo = repository(null);
    const publisher = eventPublisher();
    const service = new CooldownService(
      repo,
      eventBus().bus,
      clock,
      riskPolicyService(),
      publisher as unknown as RiskEventPublisher,
    );

    await service.start(CooldownReason.CONSECUTIVE_LOSSES, 10_000);
    clock.advanceBy(20_000);

    const active = await service.getActiveCooldown();
    expect(active).toBeNull();
    expect(publisher.cooldownEnded).toHaveBeenCalledWith(
      CooldownReason.CONSECUTIVE_LOSSES,
    );
  });

  it('end() is a no-op when no cooldown is active', async () => {
    const publisher = eventPublisher();
    const service = new CooldownService(
      repository(null),
      eventBus().bus,
      new FakeClock(),
      riskPolicyService(),
      publisher as unknown as RiskEventPublisher,
    );

    await service.end();

    expect(publisher.cooldownEnded).not.toHaveBeenCalled();
  });

  it('reload() forces a fresh read from the repository', async () => {
    const repo = repository(null);
    const service = new CooldownService(
      repo,
      eventBus().bus,
      new FakeClock(),
      riskPolicyService(),
      eventPublisher() as unknown as RiskEventPublisher,
    );
    await service.getActiveCooldown();

    const persisted: CooldownState = {
      reason: CooldownReason.EMERGENCY_EXIT,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 100_000).toISOString(),
    };
    repo.find.mockResolvedValue(persisted);

    const reloaded = await service.reload();
    expect(reloaded).toEqual(persisted);
  });

  it('auto-starts a cooldown on StopLossHitEvent when cooldownAfterLossMs > 0', async () => {
    const repo = repository(null);
    const { bus, emit } = eventBus();
    const service = new CooldownService(
      repo,
      bus,
      new FakeClock(),
      riskPolicyService(30_000),
      eventPublisher() as unknown as RiskEventPublisher,
    );

    await service.onModuleInit();
    emit(new StopLossHitEvent('trade-1', 95, 95));
    await Promise.resolve();
    await Promise.resolve();

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: CooldownReason.STOP_LOSS_HIT }),
    );
  });

  it('does not start a cooldown on StopLossHitEvent when cooldownAfterLossMs is 0', async () => {
    const repo = repository(null);
    const { bus, emit } = eventBus();
    const service = new CooldownService(
      repo,
      bus,
      new FakeClock(),
      riskPolicyService(0),
      eventPublisher() as unknown as RiskEventPublisher,
    );

    await service.onModuleInit();
    emit(new StopLossHitEvent('trade-1', 95, 95));
    await Promise.resolve();
    await Promise.resolve();

    expect(repo.save).not.toHaveBeenCalled();
  });
});
