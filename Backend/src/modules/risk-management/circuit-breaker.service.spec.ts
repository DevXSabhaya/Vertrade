import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { BrokerHealthyEvent } from '@modules/broker-health/events/broker-healthy.event';
import { BrokerDisconnectedEvent } from '@modules/broker-health/events/broker-disconnected.event';
import { MarketDataConnectedEvent } from '@modules/market-data/events/market-data-connected.event';
import { MarketDataDisconnectedEvent } from '@modules/market-data/events/market-data-disconnected.event';
import { OrderCompletedEvent } from '@modules/order-queue/events/order-completed.event';
import { OrderFailedEvent } from '@modules/order-queue/events/order-failed.event';
import { MarketDataProviderType } from '@modules/market-data/models/market-data-provider-type.enum';
import { CircuitBreakerService } from './circuit-breaker.service';
import type { RiskPolicyService } from './risk-policy.service';
import type { RiskEventPublisher } from './risk-event-publisher';
import {
  CircuitBreakerName,
  CircuitBreakerStatus,
} from './models/circuit-breaker.model';
import { DEFAULT_RISK_POLICY } from './models/risk-policy.model';
import { FakeClock } from './testing/fake-clock';

function riskPolicyService(): RiskPolicyService {
  return {
    getPolicy: jest.fn().mockReturnValue({
      ...DEFAULT_RISK_POLICY,
      circuitBreakerFailureThreshold: 2,
      circuitBreakerOpenDurationMs: 10_000,
    }),
  } as unknown as RiskPolicyService;
}

function eventPublisher(): jest.Mocked<
  Pick<
    RiskEventPublisher,
    'circuitBreakerOpened' | 'circuitBreakerHalfOpened' | 'circuitBreakerClosed'
  >
> {
  return {
    circuitBreakerOpened: jest.fn(),
    circuitBreakerHalfOpened: jest.fn(),
    circuitBreakerClosed: jest.fn(),
  };
}

function eventBus(): { bus: IEventBus; emit: (event: BaseEvent) => void } {
  const handlers: Record<string, ((event: BaseEvent) => void)[]> = {};
  return {
    bus: {
      publish: jest.fn(),
      subscribe: <T extends BaseEvent = BaseEvent>(
        name: string,
        handler: (event: T) => void,
      ) => {
        handlers[name] = handlers[name] ?? [];
        handlers[name].push(handler as (event: BaseEvent) => void);
      },
      subscribeToAll: jest.fn(),
    },
    emit: (event) => (handlers[event.eventName] ?? []).forEach((h) => h(event)),
  };
}

describe('CircuitBreakerService', () => {
  it('starts every named breaker CLOSED', () => {
    const service = new CircuitBreakerService(
      eventBus().bus,
      new FakeClock(),
      riskPolicyService(),
      eventPublisher() as unknown as RiskEventPublisher,
    );
    for (const snapshot of service.getAllSnapshots()) {
      expect(snapshot.status).toBe(CircuitBreakerStatus.CLOSED);
    }
  });

  it('opens the BROKER breaker after BrokerDisconnectedEvent reaches the failure threshold', () => {
    const { bus, emit } = eventBus();
    const publisher = eventPublisher();
    const service = new CircuitBreakerService(
      bus,
      new FakeClock(),
      riskPolicyService(),
      publisher as unknown as RiskEventPublisher,
    );
    service.onModuleInit();

    emit(new BrokerDisconnectedEvent('reason'));
    emit(new BrokerDisconnectedEvent('reason'));

    expect(service.getSnapshot(CircuitBreakerName.BROKER).status).toBe(
      CircuitBreakerStatus.OPEN,
    );
    expect(publisher.circuitBreakerOpened).toHaveBeenCalledWith(
      CircuitBreakerName.BROKER,
      2,
    );
  });

  it('BrokerHealthyEvent resets consecutive failures and publishes CircuitBreakerClosed', () => {
    const { bus, emit } = eventBus();
    const publisher = eventPublisher();
    const service = new CircuitBreakerService(
      bus,
      new FakeClock(),
      riskPolicyService(),
      publisher as unknown as RiskEventPublisher,
    );
    service.onModuleInit();

    emit(new BrokerDisconnectedEvent('reason'));
    emit(new BrokerHealthyEvent('DISCONNECTED'));

    expect(service.getSnapshot(CircuitBreakerName.BROKER).status).toBe(
      CircuitBreakerStatus.CLOSED,
    );
    expect(publisher.circuitBreakerClosed).toHaveBeenCalledWith(
      CircuitBreakerName.BROKER,
    );
  });

  it('opens the MARKET_DATA breaker on repeated MarketDataDisconnectedEvent, closes on MarketDataConnectedEvent', () => {
    const { bus, emit } = eventBus();
    const service = new CircuitBreakerService(
      bus,
      new FakeClock(),
      riskPolicyService(),
      eventPublisher() as unknown as RiskEventPublisher,
    );
    service.onModuleInit();

    emit(
      new MarketDataDisconnectedEvent(MarketDataProviderType.MOCK, 'reason'),
    );
    emit(
      new MarketDataDisconnectedEvent(MarketDataProviderType.MOCK, 'reason'),
    );
    expect(service.getSnapshot(CircuitBreakerName.MARKET_DATA).status).toBe(
      CircuitBreakerStatus.OPEN,
    );

    emit(new MarketDataConnectedEvent(MarketDataProviderType.MOCK));
    expect(service.getSnapshot(CircuitBreakerName.MARKET_DATA).status).toBe(
      CircuitBreakerStatus.CLOSED,
    );
  });

  it('opens the ORDER_EXECUTION breaker on repeated OrderFailedEvent, closes on OrderCompletedEvent', () => {
    const { bus, emit } = eventBus();
    const service = new CircuitBreakerService(
      bus,
      new FakeClock(),
      riskPolicyService(),
      eventPublisher() as unknown as RiskEventPublisher,
    );
    service.onModuleInit();

    emit(new OrderFailedEvent('order-1', 'rejected'));
    emit(new OrderFailedEvent('order-2', 'rejected'));
    expect(service.getSnapshot(CircuitBreakerName.ORDER_EXECUTION).status).toBe(
      CircuitBreakerStatus.OPEN,
    );

    emit(new OrderCompletedEvent('order-3', 'trade-1'));
    expect(service.getSnapshot(CircuitBreakerName.ORDER_EXECUTION).status).toBe(
      CircuitBreakerStatus.CLOSED,
    );
  });

  it('checkRecovery transitions an OPEN breaker to HALF_OPEN once the open duration elapses, publishing CircuitBreakerHalfOpened', () => {
    const { bus, emit } = eventBus();
    const publisher = eventPublisher();
    const clock = new FakeClock();
    const service = new CircuitBreakerService(
      bus,
      clock,
      riskPolicyService(),
      publisher as unknown as RiskEventPublisher,
    );
    service.onModuleInit();

    emit(new BrokerDisconnectedEvent('reason'));
    emit(new BrokerDisconnectedEvent('reason'));
    clock.advanceBy(20_000);

    service.checkRecovery();

    expect(service.getSnapshot(CircuitBreakerName.BROKER).status).toBe(
      CircuitBreakerStatus.HALF_OPEN,
    );
    expect(publisher.circuitBreakerHalfOpened).toHaveBeenCalledWith(
      CircuitBreakerName.BROKER,
    );
  });

  it('checkRecovery is a no-op for a breaker that is not OPEN', () => {
    const { bus } = eventBus();
    const publisher = eventPublisher();
    const service = new CircuitBreakerService(
      bus,
      new FakeClock(),
      riskPolicyService(),
      publisher as unknown as RiskEventPublisher,
    );
    service.onModuleInit();

    service.checkRecovery();

    expect(publisher.circuitBreakerHalfOpened).not.toHaveBeenCalled();
  });
});
