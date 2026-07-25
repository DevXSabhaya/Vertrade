import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import { OrderLifecycleStatus } from '@modules/trading-engine/domain/order-lifecycle-status.enum';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import { deriveTradeLifecycleStage } from './trade-lifecycle-mapper';
import { TradeLifecycleStage } from '../models/trade-lifecycle-stage.enum';
import { ExitReason } from '../models/exit-reason.enum';

function snapshot(overrides: Partial<TradeSnapshot> = {}): TradeSnapshot {
  return {
    id: 't1',
    direction: TradeDirection.LONG,
    state: TradeState.DRAFT,
    exchange: 'NFO',
    tradingSymbol: 'NIFTY24500CE',
    instrumentToken: 'TOKEN-1',
    quantity: 50,
    entryTriggerPrice: 100,
    initialStopLoss: 95,
    currentStopLoss: 95,
    targets: [110, 120, 135, 150],
    remainingTargets: [110, 120, 135, 150],
    entryOrderId: null,
    entryOrderLifecycle: null,
    entryFillPrice: null,
    filledQuantity: 0,
    exitOrderId: null,
    exitOrderLifecycle: null,
    exitedQuantity: 0,
    exitProceeds: 0,
    openQuantity: 0,
    exitPrice: null,
    realizedPnl: null,
    isAwaitingExit: false,
    metadata: {},
    history: [],
    createdAt: new Date(1_700_000_000_000).toISOString(),
    updatedAt: new Date(1_700_000_000_000).toISOString(),
    ...overrides,
  };
}

describe('deriveTradeLifecycleStage', () => {
  it('DRAFT -> CREATED', () => {
    expect(
      deriveTradeLifecycleStage(snapshot({ state: TradeState.DRAFT }), null),
    ).toBe(TradeLifecycleStage.CREATED);
  });

  it('WAITING_ENTRY -> QUEUED', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({ state: TradeState.WAITING_ENTRY }),
        null,
      ),
    ).toBe(TradeLifecycleStage.QUEUED);
  });

  it('ENTRY_PENDING with an in-flight submission -> ORDER_PLACED', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({
          state: TradeState.ENTRY_PENDING,
          entryOrderLifecycle: OrderLifecycleStatus.SUBMITTED,
        }),
        null,
      ),
    ).toBe(TradeLifecycleStage.ORDER_PLACED);
  });

  it('ENTRY_PENDING with the broker holding the order open -> ORDER_PENDING', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({
          state: TradeState.ENTRY_PENDING,
          entryOrderLifecycle: OrderLifecycleStatus.PENDING,
        }),
        null,
      ),
    ).toBe(TradeLifecycleStage.ORDER_PENDING);
  });

  it('ENTRY_FILLED -> ORDER_FILLED', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({ state: TradeState.ENTRY_FILLED }),
        null,
      ),
    ).toBe(TradeLifecycleStage.ORDER_FILLED);
  });

  it('ACTIVE with a partially-filled entry -> PARTIALLY_FILLED', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({
          state: TradeState.ACTIVE,
          filledQuantity: 30,
          quantity: 50,
          entryFillPrice: 100,
        }),
        null,
      ),
    ).toBe(TradeLifecycleStage.PARTIALLY_FILLED);
  });

  it('ACTIVE, fully filled, no targets hit -> POSITION_OPEN', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({
          state: TradeState.ACTIVE,
          filledQuantity: 50,
          entryFillPrice: 100,
        }),
        null,
      ),
    ).toBe(TradeLifecycleStage.POSITION_OPEN);
  });

  it('ACTIVE with target 1 hit -> TARGET1_HIT', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({
          state: TradeState.ACTIVE,
          filledQuantity: 50,
          entryFillPrice: 100,
          remainingTargets: [120, 135, 150],
        }),
        null,
      ),
    ).toBe(TradeLifecycleStage.TARGET1_HIT);
  });

  it('ACTIVE with target 2 hit -> TARGET2_HIT', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({
          state: TradeState.ACTIVE,
          filledQuantity: 50,
          entryFillPrice: 100,
          remainingTargets: [135, 150],
        }),
        null,
      ),
    ).toBe(TradeLifecycleStage.TARGET2_HIT);
  });

  it('ACTIVE with target 3 hit -> TARGET3_HIT', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({
          state: TradeState.ACTIVE,
          filledQuantity: 50,
          entryFillPrice: 100,
          remainingTargets: [150],
        }),
        null,
      ),
    ).toBe(TradeLifecycleStage.TARGET3_HIT);
  });

  it('ACTIVE with every target hit -> TRAILING_SL', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({
          state: TradeState.ACTIVE,
          filledQuantity: 50,
          entryFillPrice: 100,
          remainingTargets: [],
        }),
        null,
      ),
    ).toBe(TradeLifecycleStage.TRAILING_SL);
  });

  it('ACTIVE and awaiting exit, before the exit order begins -> EXIT_REQUESTED', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({
          state: TradeState.ACTIVE,
          filledQuantity: 50,
          entryFillPrice: 100,
          isAwaitingExit: true,
          exitOrderLifecycle: null,
        }),
        null,
      ),
    ).toBe(TradeLifecycleStage.EXIT_REQUESTED);
  });

  it('ACTIVE and awaiting exit, once the exit order is in flight -> EXIT_PENDING', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({
          state: TradeState.ACTIVE,
          filledQuantity: 50,
          entryFillPrice: 100,
          isAwaitingExit: true,
          exitOrderLifecycle: OrderLifecycleStatus.SUBMITTED,
        }),
        null,
      ),
    ).toBe(TradeLifecycleStage.EXIT_PENDING);
  });

  it('COMPLETED with no recorded exit reason -> COMPLETED', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({ state: TradeState.COMPLETED }),
        null,
      ),
    ).toBe(TradeLifecycleStage.COMPLETED);
  });

  it('COMPLETED with exitReason STOPLOSS -> STOPLOSS_HIT', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({ state: TradeState.COMPLETED }),
        ExitReason.STOPLOSS,
      ),
    ).toBe(TradeLifecycleStage.STOPLOSS_HIT);
  });

  it('COMPLETED with exitReason MANUAL -> MANUAL_EXIT', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({ state: TradeState.COMPLETED }),
        ExitReason.MANUAL,
      ),
    ).toBe(TradeLifecycleStage.MANUAL_EXIT);
  });

  it('COMPLETED with exitReason FORCE -> FORCE_EXITED', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({ state: TradeState.COMPLETED }),
        ExitReason.FORCE,
      ),
    ).toBe(TradeLifecycleStage.FORCE_EXITED);
  });

  it('CANCELLED (ordinary) -> CANCELLED', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({ state: TradeState.CANCELLED }),
        null,
      ),
    ).toBe(TradeLifecycleStage.CANCELLED);
  });

  it('CANCELLED with exitReason EMERGENCY -> FORCE_EXITED', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({ state: TradeState.CANCELLED }),
        ExitReason.EMERGENCY,
      ),
    ).toBe(TradeLifecycleStage.FORCE_EXITED);
  });

  it('REJECTED -> REJECTED', () => {
    expect(
      deriveTradeLifecycleStage(snapshot({ state: TradeState.REJECTED }), null),
    ).toBe(TradeLifecycleStage.REJECTED);
  });

  it('FAILED -> FAILED', () => {
    expect(
      deriveTradeLifecycleStage(snapshot({ state: TradeState.FAILED }), null),
    ).toBe(TradeLifecycleStage.FAILED);
  });

  it('ERROR -> FAILED', () => {
    expect(
      deriveTradeLifecycleStage(snapshot({ state: TradeState.ERROR }), null),
    ).toBe(TradeLifecycleStage.FAILED);
  });

  it('RECOVERY with no fill yet -> ORDER_PENDING', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({ state: TradeState.RECOVERY, filledQuantity: 0 }),
        null,
      ),
    ).toBe(TradeLifecycleStage.ORDER_PENDING);
  });

  it('RECOVERY with an existing fill -> derives an ACTIVE-style stage', () => {
    expect(
      deriveTradeLifecycleStage(
        snapshot({
          state: TradeState.RECOVERY,
          filledQuantity: 50,
          entryFillPrice: 100,
        }),
        null,
      ),
    ).toBe(TradeLifecycleStage.POSITION_OPEN);
  });
});
