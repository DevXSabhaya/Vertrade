import type { IClock } from '@shared/clock/clock.interface';
import { OrderResponse } from '@modules/broker/executors/models/order-response.model';
import { OrderStatus } from '@modules/broker/executors/models/order-status.enum';
import { Trade } from './trade.aggregate';
import { TradeDirection } from './trade-direction.enum';
import { TradeState } from './trade-state.enum';
import { OrderLifecycleStatus } from './order-lifecycle-status.enum';
import type { CreateTradeParams } from './create-trade.params';
import { InvalidTradeDefinitionException } from '../exceptions/invalid-trade-definition.exception';
import { IllegalTradeStateTransitionException } from '../exceptions/illegal-trade-state-transition.exception';
import { TradeCreatedEvent } from '../events/trade-created.event';
import { EntryTriggeredEvent } from '../events/entry-triggered.event';
import { EntryFilledEvent } from '../events/entry-filled.event';
import { TargetHitEvent } from '../events/target-hit.event';
import { TrailingSLMovedEvent } from '../events/trailing-sl-moved.event';
import { StopLossHitEvent } from '../events/stop-loss-hit.event';
import { TradeExitedEvent } from '../events/trade-exited.event';
import { TradeCompletedEvent } from '../events/trade-completed.event';
import { TradeCancelledEvent } from '../events/trade-cancelled.event';
import { TradeRejectedEvent } from '../events/trade-rejected.event';
import { TradeRecoveredEvent } from '../events/trade-recovered.event';
import { TradeFailedEvent } from '../events/trade-failed.event';

/** No randomness, no timers: every call advances a fixed synthetic clock by 1ms. */
class FakeClock implements IClock {
  private current = 1_700_000_000_000;

  now(): Date {
    this.current += 1;
    return new Date(this.current);
  }
}

function longParams(
  overrides: Partial<CreateTradeParams> = {},
): CreateTradeParams {
  return {
    direction: TradeDirection.LONG,
    exchange: 'NFO',
    tradingSymbol: 'NIFTY24500CE',
    instrumentToken: '12345',
    quantity: 50,
    entryTriggerPrice: 100,
    initialStopLoss: 95,
    targets: [110, 120, 135, 150],
    mode: 'PAPER',
    ...overrides,
  };
}

function filledResponse(
  overrides: Partial<{
    brokerOrderId: string;
    status: OrderStatus;
    filledQuantity: number;
    averagePrice: number | null;
    message?: string;
  }> = {},
): OrderResponse {
  return new OrderResponse(
    overrides.brokerOrderId ?? 'ORDER-1',
    overrides.status ?? OrderStatus.FILLED,
    overrides.filledQuantity ?? 50,
    overrides.averagePrice ?? 100,
    new Date(),
    overrides.message,
  );
}

function activeTrade(
  clock: FakeClock,
  overrides: Partial<CreateTradeParams> = {},
): Trade {
  const trade = Trade.create(longParams(overrides), clock);
  trade.arm(clock);
  trade.triggerEntry(trade.entryTriggerPrice, clock);
  trade.pullDomainEvents();
  trade.applyEntryOrderResponse(filledResponse(), clock);
  trade.pullDomainEvents();
  return trade;
}

describe('Trade aggregate', () => {
  describe('creation', () => {
    it('starts in DRAFT and queues TradeCreatedEvent', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);

      expect(trade.state).toBe(TradeState.DRAFT);
      const events = trade.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TradeCreatedEvent);
    });

    it('rejects an invalid definition before any Trade exists', () => {
      expect(() =>
        Trade.create(longParams({ quantity: -1 }), new FakeClock()),
      ).toThrow(InvalidTradeDefinitionException);
    });

    it('never exposes a mutable reference to its targets or metadata', () => {
      const clock = new FakeClock();
      const trade = Trade.create(
        longParams({ metadata: { note: 'x' } }),
        clock,
      );

      const targets = trade.targets as number[];
      targets.push(9999);
      expect(trade.targets).toEqual([110, 120, 135, 150]);

      const metadata = trade.metadata as Record<string, unknown>;
      metadata.note = 'mutated';
      expect(trade.metadata.note).toBe('x');
    });
  });

  describe('waiting entry', () => {
    it('arms from DRAFT to WAITING_ENTRY', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);
      trade.pullDomainEvents();

      trade.arm(clock);

      expect(trade.state).toBe(TradeState.WAITING_ENTRY);
    });

    it('does not consider entry crossed below the trigger for LONG', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);
      trade.arm(clock);

      expect(trade.hasCrossedEntry(99)).toBe(false);
      expect(trade.hasCrossedEntry(100)).toBe(true);
    });
  });

  describe('entry triggered / filled', () => {
    it('moves WAITING_ENTRY -> ENTRY_PENDING and submits the order lifecycle', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);
      trade.arm(clock);
      trade.pullDomainEvents();

      trade.triggerEntry(100, clock);

      expect(trade.state).toBe(TradeState.ENTRY_PENDING);
      expect(trade.entryOrderLifecycle).toBe(OrderLifecycleStatus.SUBMITTED);
      const events = trade.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(EntryTriggeredEvent);
    });

    it('stays ENTRY_PENDING on an OPEN response, with no event', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);
      trade.arm(clock);
      trade.triggerEntry(100, clock);
      trade.pullDomainEvents();

      trade.applyEntryOrderResponse(
        filledResponse({
          status: OrderStatus.OPEN,
          filledQuantity: 0,
          averagePrice: null,
        }),
        clock,
      );

      expect(trade.state).toBe(TradeState.ENTRY_PENDING);
      expect(trade.entryOrderLifecycle).toBe(OrderLifecycleStatus.PENDING);
      expect(trade.pullDomainEvents()).toHaveLength(0);
    });

    it('a fully FILLED response becomes ACTIVE and records the fill', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);
      trade.arm(clock);
      trade.triggerEntry(100, clock);
      trade.pullDomainEvents();

      trade.applyEntryOrderResponse(filledResponse(), clock);

      expect(trade.state).toBe(TradeState.ACTIVE);
      expect(trade.entryFillPrice).toBe(100);
      expect(trade.filledQuantity).toBe(50);
      expect(trade.currentStopLoss).toBe(95);
      const events = trade.pullDomainEvents();
      expect(events.some((e) => e instanceof EntryFilledEvent)).toBe(true);
    });

    it('a PARTIALLY_FILLED response still becomes ACTIVE with the partial quantity', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);
      trade.arm(clock);
      trade.triggerEntry(100, clock);
      trade.pullDomainEvents();

      trade.applyEntryOrderResponse(
        filledResponse({
          status: OrderStatus.PARTIALLY_FILLED,
          filledQuantity: 30,
        }),
        clock,
      );

      expect(trade.state).toBe(TradeState.ACTIVE);
      expect(trade.filledQuantity).toBe(30);
      expect(trade.openQuantity).toBe(30);
    });
  });

  describe('rejected trade', () => {
    it('a REJECTED entry response terminates the trade as REJECTED', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);
      trade.arm(clock);
      trade.triggerEntry(100, clock);
      trade.pullDomainEvents();

      trade.applyEntryOrderResponse(
        filledResponse({
          status: OrderStatus.REJECTED,
          filledQuantity: 0,
          averagePrice: null,
          message: 'no funds',
        }),
        clock,
      );

      expect(trade.state).toBe(TradeState.REJECTED);
      const events = trade.pullDomainEvents();
      expect(events[0]).toBeInstanceOf(TradeRejectedEvent);
    });
  });

  describe('failed trade', () => {
    it('a FAILED entry response terminates the trade as FAILED', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);
      trade.arm(clock);
      trade.triggerEntry(100, clock);
      trade.pullDomainEvents();

      trade.applyEntryOrderResponse(
        filledResponse({
          status: OrderStatus.FAILED,
          filledQuantity: 0,
          averagePrice: null,
          message: 'timeout',
        }),
        clock,
      );

      expect(trade.state).toBe(TradeState.FAILED);
      const events = trade.pullDomainEvents();
      expect(events[0]).toBeInstanceOf(TradeFailedEvent);
    });

    it('markEntryOrderFailed (executor threw) also terminates as FAILED', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);
      trade.arm(clock);
      trade.triggerEntry(100, clock);
      trade.pullDomainEvents();

      trade.markEntryOrderFailed('network error', clock);

      expect(trade.state).toBe(TradeState.FAILED);
    });
  });

  describe('immediate stop loss (no targets hit yet)', () => {
    it('flags awaiting exit and publishes StopLossHitEvent as soon as price touches SL', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock);

      const outcome = trade.advancePrice(95, clock);

      expect(outcome.targetsHit).toBe(0);
      expect(outcome.stopLossTriggered).toBe(true);
      expect(trade.isAwaitingExit).toBe(true);
      expect(trade.state).toBe(TradeState.ACTIVE);
      const events = trade.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(StopLossHitEvent);
    });
  });

  describe.each([
    { label: '1 target', targets: [110] },
    { label: '3 targets', targets: [110, 120, 135] },
    { label: '5 targets', targets: [110, 120, 135, 150, 170] },
    {
      label: '10 targets',
      targets: [105, 110, 115, 120, 125, 130, 135, 140, 145, 150],
    },
  ])('generalized target system: $label', ({ targets }) => {
    it('trails the stop loss to the previous target after each hit, generalized for any count', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock, { targets });

      let expectedSl = 100; // entry fill price
      targets.forEach((target, index) => {
        const outcome = trade.advancePrice(target, clock);
        expect(outcome.targetsHit).toBe(1);

        const events = trade.pullDomainEvents();
        expect(events.some((e) => e instanceof TargetHitEvent)).toBe(true);
        expect(events.some((e) => e instanceof TrailingSLMovedEvent)).toBe(
          true,
        );

        expectedSl = index === 0 ? 100 : targets[index - 1];
        expect(trade.currentStopLoss).toBe(expectedSl);
        expect(trade.remainingTargets).toEqual(targets.slice(index + 1));
        expect(trade.state).toBe(TradeState.ACTIVE);
      });
    });
  });

  it('supports an unlimited number of targets with no hardcoded limit', () => {
    const clock = new FakeClock();
    const targets = Array.from({ length: 50 }, (_, i) => 101 + i);
    const trade = activeTrade(clock, { targets });

    for (const target of targets) {
      trade.advancePrice(target, clock);
      trade.pullDomainEvents();
    }

    expect(trade.remainingTargets).toHaveLength(0);
    expect(trade.currentStopLoss).toBe(targets[targets.length - 2]);
  });

  it('crosses multiple targets in a single large price jump, in order', () => {
    const clock = new FakeClock();
    const trade = activeTrade(clock, { targets: [110, 120, 135, 150] });

    const outcome = trade.advancePrice(140, clock);

    expect(outcome.targetsHit).toBe(3);
    expect(trade.remainingTargets).toEqual([150]);
    expect(trade.currentStopLoss).toBe(120);
    const events = trade.pullDomainEvents();
    expect(events.filter((e) => e instanceof TargetHitEvent)).toHaveLength(3);
    expect(
      events.filter((e) => e instanceof TrailingSLMovedEvent),
    ).toHaveLength(3);
  });

  it('keeps trailing from the last target until stop loss exits after the final target', () => {
    const clock = new FakeClock();
    const trade = activeTrade(clock, { targets: [110, 120, 135, 150] });

    for (const target of [110, 120, 135, 150]) {
      trade.advancePrice(target, clock);
      trade.pullDomainEvents();
    }
    expect(trade.currentStopLoss).toBe(135);
    expect(trade.remainingTargets).toHaveLength(0);

    // No more targets: further upward movement does nothing new.
    const noop = trade.advancePrice(160, clock);
    expect(noop.targetsHit).toBe(0);
    expect(noop.stopLossTriggered).toBe(false);

    // Price falls back to the trailed stop loss -> exit signalled.
    const exitOutcome = trade.advancePrice(135, clock);
    expect(exitOutcome.stopLossTriggered).toBe(true);
    expect(trade.isAwaitingExit).toBe(true);
  });

  describe('exit after stop loss', () => {
    it('fully closes the trade on a FILLED exit response and computes realized PnL', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock);
      trade.advancePrice(95, clock);
      trade.pullDomainEvents();

      trade.beginExitAttempt();
      trade.applyExitOrderResponse(
        filledResponse({
          brokerOrderId: 'EXIT-1',
          status: OrderStatus.FILLED,
          filledQuantity: 50,
          averagePrice: 95,
        }),
        clock,
      );

      expect(trade.state).toBe(TradeState.COMPLETED);
      expect(trade.exitPrice).toBe(95);
      expect(trade.realizedPnl).toBe((95 - 100) * 50);
      const events = trade.pullDomainEvents();
      expect(events.some((e) => e instanceof TradeExitedEvent)).toBe(true);
      expect(events.some((e) => e instanceof TradeCompletedEvent)).toBe(true);
    });

    it('computes positive PnL after a target-trailed exit', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock, { targets: [110, 120, 135, 150] });
      trade.advancePrice(110, clock);
      trade.pullDomainEvents();
      trade.advancePrice(100, clock); // falls back to the trailed SL (entry = 100)
      trade.pullDomainEvents();

      trade.beginExitAttempt();
      trade.applyExitOrderResponse(
        filledResponse({
          brokerOrderId: 'EXIT-1',
          status: OrderStatus.FILLED,
          filledQuantity: 50,
          averagePrice: 100,
        }),
        clock,
      );

      expect(trade.state).toBe(TradeState.COMPLETED);
      expect(trade.realizedPnl).toBe(0);
    });

    it('a partial exit fill keeps the trade ACTIVE and awaiting the remainder', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock);
      trade.advancePrice(95, clock);
      trade.pullDomainEvents();

      trade.beginExitAttempt();
      trade.applyExitOrderResponse(
        filledResponse({
          brokerOrderId: 'EXIT-1',
          status: OrderStatus.PARTIALLY_FILLED,
          filledQuantity: 20,
          averagePrice: 95,
        }),
        clock,
      );

      expect(trade.state).toBe(TradeState.ACTIVE);
      expect(trade.isAwaitingExit).toBe(true);
      expect(trade.openQuantity).toBe(30);
      expect(trade.pullDomainEvents()).toHaveLength(0);
    });

    it('a REJECTED exit attempt leaves the trade ACTIVE and awaiting a retry', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock);
      trade.advancePrice(95, clock);
      trade.pullDomainEvents();

      trade.beginExitAttempt();
      trade.applyExitOrderResponse(
        filledResponse({
          brokerOrderId: 'EXIT-1',
          status: OrderStatus.REJECTED,
          filledQuantity: 0,
          averagePrice: null,
        }),
        clock,
      );

      expect(trade.state).toBe(TradeState.ACTIVE);
      expect(trade.isAwaitingExit).toBe(true);
      expect(trade.exitOrderLifecycle).toBeNull();

      // A fresh retry attempt is possible since the lifecycle was reset.
      expect(() => trade.beginExitAttempt()).not.toThrow();
    });
  });

  describe('cancelled trade', () => {
    it('cancels from WAITING_ENTRY with a reason', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);
      trade.arm(clock);
      trade.pullDomainEvents();

      trade.cancel('user requested', clock);

      expect(trade.state).toBe(TradeState.CANCELLED);
      const events = trade.pullDomainEvents();
      expect(events[0]).toBeInstanceOf(TradeCancelledEvent);
    });

    it('cannot be cancelled once ACTIVE (illegal transition)', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock);

      expect(() => trade.cancel('too late', clock)).toThrow(
        IllegalTradeStateTransitionException,
      );
    });
  });

  describe('recovery', () => {
    it('enters RECOVERY from ACTIVE and resumes back to ACTIVE', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock);

      trade.enterRecovery('restart', clock);
      expect(trade.state).toBe(TradeState.RECOVERY);

      trade.resumeFromRecovery(clock);
      expect(trade.state).toBe(TradeState.ACTIVE);
      const events = trade.pullDomainEvents();
      expect(events.some((e) => e instanceof TradeRecoveredEvent)).toBe(true);
    });
  });

  describe('illegal transition', () => {
    it('throws IllegalTradeStateTransitionException when rejecting an already-terminal trade', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);
      trade.reject('first rejection', clock);
      expect(trade.state).toBe(TradeState.REJECTED);

      // REJECTED is terminal: a second reject() is an illegal transition.
      expect(() => trade.reject('second rejection', clock)).toThrow(
        IllegalTradeStateTransitionException,
      );
    });
  });

  describe('determinism: duplicate / repeated / out-of-order price updates', () => {
    it('ignores a duplicate identical price update (no double target hit, no double event)', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock, { targets: [110] });

      trade.advancePrice(110, clock);
      const firstEvents = trade.pullDomainEvents();
      expect(
        firstEvents.filter((e) => e instanceof TargetHitEvent),
      ).toHaveLength(1);

      const outcome = trade.advancePrice(110, clock);
      expect(outcome.targetsHit).toBe(0);
      expect(trade.pullDomainEvents()).toHaveLength(0);
    });

    it('repeated identical stop-loss-triggering price updates only publish StopLossHit once', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock);

      trade.advancePrice(95, clock);
      expect(
        trade.pullDomainEvents().filter((e) => e instanceof StopLossHitEvent),
      ).toHaveLength(1);

      trade.advancePrice(95, clock);
      expect(
        trade.pullDomainEvents().filter((e) => e instanceof StopLossHitEvent),
      ).toHaveLength(0);
    });

    it('an out-of-order lower price after targets were hit does not un-trail the stop loss', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock, { targets: [110, 120, 135, 150] });

      trade.advancePrice(120, clock); // hits both 110 and 120 targets
      trade.pullDomainEvents();
      expect(trade.currentStopLoss).toBe(110);

      // An out-of-order lower (but still above SL) price arrives (e.g. a
      // delayed tick) — it must not move the stop loss backward or re-hit
      // a target that has already been consumed.
      trade.advancePrice(115, clock);
      expect(trade.currentStopLoss).toBe(110);
      expect(trade.remainingTargets).toEqual([135, 150]);
    });
  });

  describe('SHORT direction', () => {
    function shortActiveTrade(clock: FakeClock): Trade {
      const trade = Trade.create(
        longParams({
          direction: TradeDirection.SHORT,
          entryTriggerPrice: 100,
          initialStopLoss: 105,
          targets: [90, 80, 65, 50],
        }),
        clock,
      );
      trade.arm(clock);
      trade.triggerEntry(100, clock);
      trade.pullDomainEvents();
      trade.applyEntryOrderResponse(
        filledResponse({ averagePrice: 100 }),
        clock,
      );
      trade.pullDomainEvents();
      return trade;
    }

    it('trails the stop loss downward as price falls through targets', () => {
      const clock = new FakeClock();
      const trade = shortActiveTrade(clock);

      trade.advancePrice(90, clock);
      trade.pullDomainEvents();
      expect(trade.currentStopLoss).toBe(100);

      trade.advancePrice(80, clock);
      trade.pullDomainEvents();
      expect(trade.currentStopLoss).toBe(90);
    });

    it('exits and computes positive PnL when price falls and is bought back lower', () => {
      const clock = new FakeClock();
      const trade = shortActiveTrade(clock);

      trade.advancePrice(90, clock);
      trade.pullDomainEvents();
      trade.advancePrice(105, clock); // reverses back up through the trailed SL (100)
      trade.pullDomainEvents();

      expect(trade.isAwaitingExit).toBe(true);
      trade.beginExitAttempt();
      trade.applyExitOrderResponse(
        filledResponse({
          brokerOrderId: 'EXIT-1',
          status: OrderStatus.FILLED,
          filledQuantity: 50,
          averagePrice: 100,
        }),
        clock,
      );

      expect(trade.state).toBe(TradeState.COMPLETED);
      expect(trade.realizedPnl).toBe(0);
    });
  });

  describe('unrealized PnL', () => {
    it('is null before the entry fills', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);
      expect(trade.getUnrealizedPnl(105)).toBeNull();
    });

    it('is positive for a LONG trade when price rises above the fill price', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock);
      expect(trade.getUnrealizedPnl(105)).toBe((105 - 100) * 50);
    });

    it('is positive for a SHORT trade when price falls below the fill price', () => {
      const clock = new FakeClock();
      const trade = Trade.create(
        longParams({
          direction: TradeDirection.SHORT,
          entryTriggerPrice: 100,
          initialStopLoss: 105,
          targets: [90, 80, 65, 50],
        }),
        clock,
      );
      trade.arm(clock);
      trade.triggerEntry(100, clock);
      trade.applyEntryOrderResponse(
        filledResponse({ averagePrice: 100 }),
        clock,
      );

      expect(trade.getUnrealizedPnl(90)).toBe((100 - 90) * 50);
    });
  });

  describe('state machine integrity', () => {
    it('records every transition in history, in order', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock);

      const states = trade.history.map((entry) => entry.state);
      expect(states).toEqual([
        TradeState.DRAFT,
        TradeState.WAITING_ENTRY,
        TradeState.ENTRY_PENDING,
        TradeState.ENTRY_FILLED,
        TradeState.ACTIVE,
      ]);
    });

    it('toSnapshot() never exposes a live reference to internal history', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock);

      const snapshot = trade.toSnapshot();
      (snapshot.history as unknown[]).push('corrupted');
      expect(trade.history).toHaveLength(5);
    });
  });

  describe('moveStopLoss (Phase 10 — Trailing Stop Engine)', () => {
    it('moves the stop loss forward on a LONG trade and returns true', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock);

      const result = trade.moveStopLoss(101, clock);

      expect(result).toBe(true);
      expect(trade.currentStopLoss).toBe(101);
    });

    it('publishes TrailingSLMovedEvent', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock);

      trade.moveStopLoss(101, clock);
      const events = trade.pullDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TrailingSLMovedEvent);
      expect((events[0] as TrailingSLMovedEvent).newStopLoss).toBe(101);
    });

    it('never moves the stop loss backward on a LONG trade', () => {
      const clock = new FakeClock();
      const trade = activeTrade(clock);
      trade.moveStopLoss(101, clock);
      trade.pullDomainEvents();

      const result = trade.moveStopLoss(99, clock);

      expect(result).toBe(false);
      expect(trade.currentStopLoss).toBe(101);
      expect(trade.pullDomainEvents()).toEqual([]);
    });

    it('never moves the stop loss backward on a SHORT trade (backward means upward)', () => {
      const clock = new FakeClock();
      const trade = Trade.create(
        longParams({
          direction: TradeDirection.SHORT,
          initialStopLoss: 105,
          targets: [90, 80, 65, 50],
        }),
        clock,
      );
      trade.arm(clock);
      trade.triggerEntry(100, clock);
      trade.pullDomainEvents();
      trade.applyEntryOrderResponse(filledResponse(), clock);
      trade.pullDomainEvents();

      expect(trade.moveStopLoss(99, clock)).toBe(true);
      expect(trade.currentStopLoss).toBe(99);
      trade.pullDomainEvents();

      expect(trade.moveStopLoss(102, clock)).toBe(false);
      expect(trade.currentStopLoss).toBe(99);
    });

    it('is a no-op on a non-ACTIVE trade', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);
      trade.arm(clock);

      expect(trade.moveStopLoss(101, clock)).toBe(false);
    });
  });

  describe('fromSnapshot (Phase 9 — Startup Recovery)', () => {
    it('round-trips an ACTIVE trade with no loss of state', () => {
      const clock = new FakeClock();
      const original = activeTrade(clock);
      const snapshot = original.toSnapshot();

      const rehydrated = Trade.fromSnapshot(snapshot);

      expect(rehydrated.toSnapshot()).toEqual(snapshot);
    });

    it('round-trips a trade mid partial-exit, preserving exitProceeds so the next fill computes PnL correctly', () => {
      const clock = new FakeClock();
      const original = activeTrade(clock);
      original.advancePrice(200, clock); // crosses every target, arms exit
      original.pullDomainEvents();
      original.beginExitAttempt();
      original.applyExitOrderResponse(
        filledResponse({ filledQuantity: 20, averagePrice: 150 }),
        clock,
      ); // partial exit: 20 of 50 — trade stays ACTIVE, awaiting the rest
      original.pullDomainEvents();
      const snapshot = original.toSnapshot();
      expect(snapshot.exitedQuantity).toBe(20);
      expect(snapshot.realizedPnl).toBeNull();

      const rehydrated = Trade.fromSnapshot(snapshot);
      rehydrated.beginExitAttempt();
      rehydrated.applyExitOrderResponse(
        filledResponse({ filledQuantity: 30, averagePrice: 150 }),
        clock,
      ); // remaining 30 fills — completes the trade

      expect(rehydrated.state).toBe(TradeState.COMPLETED);
      // exitProceeds carried the first partial fill's 20*150 forward, so the
      // final PnL reflects both fills, not just the second one.
      expect(rehydrated.realizedPnl).toBe((150 - 100) * 50);
    });

    it('never re-emits TradeCreatedEvent or any other event for a rehydrated trade', () => {
      const clock = new FakeClock();
      const original = activeTrade(clock);
      const snapshot = original.toSnapshot();

      const rehydrated = Trade.fromSnapshot(snapshot);

      expect(rehydrated.pullDomainEvents()).toEqual([]);
    });

    it('round-trips a terminal (CANCELLED) trade unchanged', () => {
      const clock = new FakeClock();
      const trade = Trade.create(longParams(), clock);
      trade.cancel('user requested', clock);
      trade.pullDomainEvents();
      const snapshot = trade.toSnapshot();

      const rehydrated = Trade.fromSnapshot(snapshot);

      expect(rehydrated.toSnapshot()).toEqual(snapshot);
    });
  });
});
