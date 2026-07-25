import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { TradeCompletedEvent } from '@modules/trading-engine/events/trade-completed.event';
import type { IDailyRiskStateRepository } from './interfaces/daily-risk-state-repository.interface';
import { DailyRiskStateService } from './daily-risk-state.service';
import type { RiskPolicyService } from './risk-policy.service';
import type { RiskEventPublisher } from './risk-event-publisher';
import { DEFAULT_RISK_POLICY } from './models/risk-policy.model';
import { emptyDailyRiskState } from './models/daily-risk-state.model';
import { FakeClock } from './testing/fake-clock';

function repository(): jest.Mocked<IDailyRiskStateRepository> {
  return {
    find: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function riskPolicyService(maxConsecutiveLosses = 3): RiskPolicyService {
  return {
    getPolicy: jest
      .fn()
      .mockReturnValue({ ...DEFAULT_RISK_POLICY, maxConsecutiveLosses }),
  } as unknown as RiskPolicyService;
}

function eventPublisher(): jest.Mocked<
  Pick<RiskEventPublisher, 'consecutiveLossLimitBreached'>
> {
  return { consecutiveLossLimitBreached: jest.fn() };
}

function eventBus(): {
  bus: IEventBus;
  emit: (event: BaseEvent) => void;
} {
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

describe('DailyRiskStateService', () => {
  it("creates and persists today's empty state on first read", async () => {
    const repo = repository();
    const clock = new FakeClock();
    clock.advanceBy(0);
    const service = new DailyRiskStateService(
      repo,
      eventBus().bus,
      clock,
      riskPolicyService(),
      eventPublisher() as unknown as RiskEventPublisher,
    );

    const state = await service.getState();

    expect(state.realizedPnl).toBe(0);
    expect(state.tradeCount).toBe(0);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('returns the persisted state for today without re-saving', async () => {
    const today = new FakeClock().now().toISOString().slice(0, 10);
    const repo = repository();
    repo.find.mockResolvedValue(
      emptyDailyRiskState(today, new Date().toISOString()),
    );
    const service = new DailyRiskStateService(
      repo,
      eventBus().bus,
      new FakeClock(),
      riskPolicyService(),
      eventPublisher() as unknown as RiskEventPublisher,
    );

    await service.getState();

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('accumulates realized PnL and trade count across outcomes', async () => {
    const repo = repository();
    const service = new DailyRiskStateService(
      repo,
      eventBus().bus,
      new FakeClock(),
      riskPolicyService(),
      eventPublisher() as unknown as RiskEventPublisher,
    );

    await service.recordTradeOutcome(500);
    const state = await service.recordTradeOutcome(-200);

    expect(state.realizedPnl).toBe(300);
    expect(state.tradeCount).toBe(2);
  });

  it('increments consecutive losses on a loss and resets on a win', async () => {
    const repo = repository();
    const service = new DailyRiskStateService(
      repo,
      eventBus().bus,
      new FakeClock(),
      riskPolicyService(),
      eventPublisher() as unknown as RiskEventPublisher,
    );

    await service.recordTradeOutcome(-100);
    let state = await service.recordTradeOutcome(-100);
    expect(state.consecutiveLosses).toBe(2);

    state = await service.recordTradeOutcome(50);
    expect(state.consecutiveLosses).toBe(0);
    expect(state.lastTradeWasLoss).toBe(false);
  });

  it('publishes ConsecutiveLossLimitBreached once the configured threshold is reached', async () => {
    const repo = repository();
    const publisher = eventPublisher();
    const service = new DailyRiskStateService(
      repo,
      eventBus().bus,
      new FakeClock(),
      riskPolicyService(2),
      publisher as unknown as RiskEventPublisher,
    );

    await service.recordTradeOutcome(-100);
    expect(publisher.consecutiveLossLimitBreached).not.toHaveBeenCalled();

    await service.recordTradeOutcome(-100);
    expect(publisher.consecutiveLossLimitBreached).toHaveBeenCalledWith(2, 2);
  });

  it('subscribes to TradeCompletedEvent on module init and records the outcome', async () => {
    const repo = repository();
    const { bus, emit } = eventBus();
    const service = new DailyRiskStateService(
      repo,
      bus,
      new FakeClock(),
      riskPolicyService(),
      eventPublisher() as unknown as RiskEventPublisher,
    );

    await service.onModuleInit();
    emit(new TradeCompletedEvent('trade-1', -250));
    await Promise.resolve();
    await Promise.resolve();

    const state = await service.getState();
    expect(state.realizedPnl).toBe(-250);
  });

  it('rolls over to a fresh state once the UTC trade date changes', async () => {
    const repo = repository();
    const clock = new FakeClock(Date.parse('2026-07-21T23:59:00.000Z'));
    const service = new DailyRiskStateService(
      repo,
      eventBus().bus,
      clock,
      riskPolicyService(),
      eventPublisher() as unknown as RiskEventPublisher,
    );

    await service.recordTradeOutcome(-100);
    clock.advanceBy(2 * 60 * 1000);
    const rolledOver = await service.getState();

    expect(rolledOver.realizedPnl).toBe(0);
    expect(rolledOver.tradeDate).not.toBe('2026-07-21');
  });
});
