import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import { OrderLifecycleStatus } from '@modules/trading-engine/domain/order-lifecycle-status.enum';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import { TradeLifecycleStage } from '../models/trade-lifecycle-stage.enum';
import { ExitReason } from '../models/exit-reason.enum';

const PENDING_ENTRY_STATUSES: ReadonlySet<OrderLifecycleStatus> = new Set([
  OrderLifecycleStatus.PENDING,
  OrderLifecycleStatus.PARTIALLY_FILLED,
]);

/**
 * Derives the granular Phase 10 `TradeLifecycleStage` purely from the frozen
 * (Phase 5) `TradeSnapshot`, plus this module's own `exitReason` extension
 * field for distinguishing *why* a COMPLETED/CANCELLED trade ended. This is
 * a read-only reporting projection — it never drives a transition, and the
 * underlying `TradeState` (Trade's own, real state machine) remains the only
 * thing that actually governs behavior.
 *
 * A few Phase 10 states have no independent existence in Trade's own state
 * machine and are reported as best-effort derivations, documented inline:
 * `EXIT_FILLED` is instantaneous — `Trade.applyExitOrderResponse()` moves
 * straight from ACTIVE to COMPLETED within one synchronous call, so it is
 * never observed as a snapshot's state and is folded into `COMPLETED`.
 * `EXPIRED` belongs to the Order Queue (`QueueItemState.EXPIRED`, Phase 7) —
 * a queue item can expire before a Trade ever exists, but a Trade, once
 * created, has no "expired" concept of its own; this mapper can never
 * observe it and never returns it.
 */
export function deriveTradeLifecycleStage(
  snapshot: TradeSnapshot,
  exitReason: ExitReason | null,
): TradeLifecycleStage {
  switch (snapshot.state) {
    case TradeState.DRAFT:
      return TradeLifecycleStage.CREATED;

    case TradeState.WAITING_ENTRY:
      // Trade.create() only ever succeeds after TradeValidationEngine's
      // pipeline (Phase 7) has already validated the definition — by the
      // time a Trade object exists at all, VALIDATED has already happened.
      // WAITING_ENTRY (armed, watching for the entry trigger) is the
      // closest Trade-level equivalent of "queued and waiting."
      return TradeLifecycleStage.QUEUED;

    case TradeState.ENTRY_PENDING:
      return snapshot.entryOrderLifecycle !== null &&
        PENDING_ENTRY_STATUSES.has(snapshot.entryOrderLifecycle)
        ? TradeLifecycleStage.ORDER_PENDING
        : TradeLifecycleStage.ORDER_PLACED;

    case TradeState.ENTRY_FILLED:
      return TradeLifecycleStage.ORDER_FILLED;

    case TradeState.ACTIVE:
    case TradeState.TARGET_HIT:
    case TradeState.TRAILING_SL_UPDATED:
      return deriveActiveStage(snapshot);

    case TradeState.COMPLETED:
      return completedStageFor(exitReason);

    case TradeState.CANCELLED:
      return exitReason === ExitReason.EMERGENCY
        ? TradeLifecycleStage.FORCE_EXITED
        : TradeLifecycleStage.CANCELLED;

    case TradeState.REJECTED:
      return TradeLifecycleStage.REJECTED;

    case TradeState.FAILED:
      return TradeLifecycleStage.FAILED;

    case TradeState.ERROR:
      return TradeLifecycleStage.FAILED;

    case TradeState.RECOVERY:
      // Mid-recovery: report the closest in-progress stage from whatever
      // partial fill state is already on the snapshot, since the pre-
      // recovery state itself isn't carried on TradeSnapshot.
      return snapshot.filledQuantity > 0
        ? deriveActiveStage(snapshot)
        : TradeLifecycleStage.ORDER_PENDING;
  }
}

function deriveActiveStage(snapshot: TradeSnapshot): TradeLifecycleStage {
  if (snapshot.isAwaitingExit) {
    return snapshot.exitOrderLifecycle === null
      ? TradeLifecycleStage.EXIT_REQUESTED
      : TradeLifecycleStage.EXIT_PENDING;
  }

  if (snapshot.filledQuantity < snapshot.quantity) {
    return TradeLifecycleStage.PARTIALLY_FILLED;
  }

  const targetsHit = snapshot.targets.length - snapshot.remainingTargets.length;
  if (targetsHit === 0) {
    return TradeLifecycleStage.POSITION_OPEN;
  }
  if (targetsHit === 1) {
    return TradeLifecycleStage.TARGET1_HIT;
  }
  if (targetsHit === 2) {
    return TradeLifecycleStage.TARGET2_HIT;
  }
  if (targetsHit === 3) {
    return TradeLifecycleStage.TARGET3_HIT;
  }
  // Every default target already hit and the trade is still open (trailing
  // beyond the 3rd target, or a definition with more than 3 targets).
  return TradeLifecycleStage.TRAILING_SL;
}

function completedStageFor(exitReason: ExitReason | null): TradeLifecycleStage {
  switch (exitReason) {
    case ExitReason.STOPLOSS:
      return TradeLifecycleStage.STOPLOSS_HIT;
    case ExitReason.MANUAL:
      return TradeLifecycleStage.MANUAL_EXIT;
    case ExitReason.FORCE:
    case ExitReason.EMERGENCY:
    case ExitReason.BROKER_DISCONNECT:
      return TradeLifecycleStage.FORCE_EXITED;
    case ExitReason.TARGET:
    case ExitReason.MARKET_CLOSE:
    case null:
      return TradeLifecycleStage.COMPLETED;
  }
}
