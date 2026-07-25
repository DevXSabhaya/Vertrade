import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import type { IRiskEventRepository } from './interfaces/risk-event-repository.interface';
import type { IRiskViolationRepository } from './interfaces/risk-violation-repository.interface';
import { RiskEventRecorderService } from './risk-event-recorder.service';
import { TradeRiskRejectedEvent } from './events/trade-risk-rejected.event';
import { TradeRiskApprovedEvent } from './events/trade-risk-approved.event';
import { RiskReasonCode } from './models/risk-reason-code.enum';
import { KillSwitchStatus } from './models/kill-switch-status.enum';
import type { RiskSnapshot } from './models/risk-snapshot.model';
import { DEFAULT_RISK_POLICY } from './models/risk-policy.model';

function snapshot(): RiskSnapshot {
  return {
    asOf: new Date().toISOString(),
    dailyRealizedPnl: 0,
    dailyUnrealizedPnl: 0,
    totalPnl: 0,
    openTradeCount: 0,
    openPositionCount: 0,
    totalExposure: 0,
    availableCapital: DEFAULT_RISK_POLICY.availableCapital,
    usedCapital: 0,
    currentRisk: 0,
    consecutiveLosses: 0,
    cooldown: null,
    killSwitchStatus: KillSwitchStatus.ACTIVE,
    emergencyStopActive: false,
    circuitBreakers: [],
  };
}

function eventBus(): { bus: IEventBus; emit: (event: BaseEvent) => void } {
  let handler: ((event: BaseEvent) => void) | null = null;
  return {
    bus: {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: (h: (event: BaseEvent) => void) => {
        handler = h;
      },
    },
    emit: (event) => handler?.(event),
  };
}

function unrelatedEvent(): BaseEvent {
  return {
    eventName: 'trade-lifecycle.something.happened',
    metadata: {
      timestamp: new Date().toISOString(),
      version: 1,
      category: 'DOMAIN' as never,
    },
  };
}

describe('RiskEventRecorderService', () => {
  function build() {
    const eventRepository: jest.Mocked<IRiskEventRepository> = {
      save: jest.fn().mockResolvedValue(undefined),
      findRecent: jest.fn().mockResolvedValue([]),
    };
    const violationRepository: jest.Mocked<IRiskViolationRepository> = {
      save: jest.fn().mockResolvedValue(undefined),
      findRecent: jest.fn().mockResolvedValue([]),
    };
    const { bus, emit } = eventBus();
    const service = new RiskEventRecorderService(
      bus,
      eventRepository,
      violationRepository,
    );
    service.onModuleInit();
    return { service, eventRepository, violationRepository, emit };
  }

  it('ignores events outside the risk-management namespace', async () => {
    const { eventRepository, emit } = build();
    emit(unrelatedEvent());
    await Promise.resolve();
    expect(eventRepository.save).not.toHaveBeenCalled();
  });

  it('persists a RiskEventRecord for every risk-management event', async () => {
    const { eventRepository, emit } = build();
    emit(new TradeRiskApprovedEvent('RELIANCE', snapshot()));
    await Promise.resolve();

    expect(eventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'risk-management.trade.approved',
      }),
    );
  });

  it('additionally persists a RiskViolation for a TradeRiskRejectedEvent', async () => {
    const { eventRepository, violationRepository, emit } = build();
    emit(
      new TradeRiskRejectedEvent(
        'RELIANCE',
        25,
        RiskReasonCode.MAX_OPEN_TRADES_REACHED,
        'Maximum open trades reached (3)',
        snapshot(),
      ),
    );
    await Promise.resolve();

    expect(eventRepository.save).toHaveBeenCalledTimes(1);
    expect(violationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: RiskReasonCode.MAX_OPEN_TRADES_REACHED,
        rawSymbol: 'RELIANCE',
        requestedQuantity: 25,
        message: 'Maximum open trades reached (3)',
      }),
    );
  });

  it('does not persist a RiskViolation for a non-rejection risk event', async () => {
    const { violationRepository, emit } = build();
    emit(new TradeRiskApprovedEvent('RELIANCE', snapshot()));
    await Promise.resolve();
    expect(violationRepository.save).not.toHaveBeenCalled();
  });
});
