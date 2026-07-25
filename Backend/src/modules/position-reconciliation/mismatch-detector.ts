import { OrderStatus } from '@modules/broker/executors/models/order-status.enum';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import { MismatchLevel } from './models/mismatch-level.enum';
import type { PositionMismatch } from './models/position-mismatch.model';
import type { LocalPositionView } from './models/local-position-view.model';
import type { BrokerPositionView } from './models/broker-position-view.model';

const PRICE_EPSILON = 0.01;
const NOT_BROKER_VERIFIABLE =
  'IOrderExecutor.getOrderStatus() does not report this field — not independently broker-verifiable with the current executor contract.';

const NEGATIVE_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.REJECTED,
  OrderStatus.CANCELLED,
  OrderStatus.FAILED,
]);

function noDifference(
  field: PositionMismatch['field'],
  value: string,
): PositionMismatch {
  return {
    field,
    level: MismatchLevel.NO_DIFFERENCE,
    localValue: value,
    brokerValue: value,
    description: 'No mismatch.',
  };
}

function notVerifiable(
  field: PositionMismatch['field'],
  localValue: string,
): PositionMismatch {
  return {
    field,
    level: MismatchLevel.NO_DIFFERENCE,
    localValue,
    brokerValue: 'n/a',
    description: NOT_BROKER_VERIFIABLE,
  };
}

/**
 * Pure comparison logic (Part 7 of the Phase 9 spec) — every field the spec
 * lists is compared exactly once. Fields IOrderExecutor genuinely cannot
 * verify (symbol/exchange/token/side/quantity/SL/targets/trailing SL — the
 * broker order-status response never echoes these back) are reported as
 * NO_DIFFERENCE with an explicit "not verifiable" note rather than silently
 * omitted, so a report reader can see exactly what was and wasn't checked.
 */
export const MismatchDetector = {
  detect(
    local: LocalPositionView,
    broker: BrokerPositionView,
  ): PositionMismatch[] {
    return [
      notVerifiable('tradingSymbol', local.tradingSymbol),
      notVerifiable('exchange', local.exchange),
      notVerifiable('instrumentToken', local.instrumentToken),
      notVerifiable('side', local.side),
      notVerifiable('quantity', String(local.quantity)),
      this.compareAveragePrice(local, broker),
      this.compareFilledQuantity(local, broker),
      this.comparePendingQuantity(local, broker),
      notVerifiable('stopLoss', String(local.currentStopLoss)),
      notVerifiable('targets', JSON.stringify(local.targets)),
      notVerifiable('trailingStopLoss', String(local.currentStopLoss)),
      this.compareOrderState(local, broker),
      this.compareTradeState(local, broker),
      this.comparePositionState(local, broker),
    ];
  },

  compareFilledQuantity(
    local: LocalPositionView,
    broker: BrokerPositionView,
  ): PositionMismatch {
    if (broker.entryFilledQuantity === null) {
      return notVerifiable('filledQuantity', String(local.filledQuantity));
    }
    if (local.filledQuantity === broker.entryFilledQuantity) {
      return noDifference('filledQuantity', String(local.filledQuantity));
    }
    const brokerAhead = broker.entryFilledQuantity > local.filledQuantity;
    return {
      field: 'filledQuantity',
      level: brokerAhead ? MismatchLevel.ERROR : MismatchLevel.CRITICAL,
      localValue: String(local.filledQuantity),
      brokerValue: String(broker.entryFilledQuantity),
      description: brokerAhead
        ? 'Broker reports a larger filled quantity than the local trade recorded — likely a crash between the broker fill and the local state update.'
        : 'Local trade shows a larger filled quantity than the broker reports — local state is ahead of the broker and cannot be trusted without investigation.',
    };
  },

  comparePendingQuantity(
    local: LocalPositionView,
    broker: BrokerPositionView,
  ): PositionMismatch {
    const localPending = local.quantity - local.filledQuantity;
    if (broker.entryFilledQuantity === null) {
      return notVerifiable('pendingQuantity', String(localPending));
    }
    const brokerPending = local.quantity - broker.entryFilledQuantity;
    if (localPending === brokerPending) {
      return noDifference('pendingQuantity', String(localPending));
    }
    return {
      field: 'pendingQuantity',
      level: MismatchLevel.WARNING,
      localValue: String(localPending),
      brokerValue: String(brokerPending),
      description:
        'Pending quantity derived from local vs. broker fill data disagrees.',
    };
  },

  compareAveragePrice(
    local: LocalPositionView,
    broker: BrokerPositionView,
  ): PositionMismatch {
    if (local.averagePrice === null || broker.entryAveragePrice === null) {
      return notVerifiable(
        'averagePrice',
        String(local.averagePrice ?? 'null'),
      );
    }
    const diff = Math.abs(local.averagePrice - broker.entryAveragePrice);
    if (diff <= PRICE_EPSILON) {
      return noDifference('averagePrice', String(local.averagePrice));
    }
    return {
      field: 'averagePrice',
      level: MismatchLevel.WARNING,
      localValue: String(local.averagePrice),
      brokerValue: String(broker.entryAveragePrice),
      description:
        'Local entry fill price differs from the broker-reported average price.',
    };
  },

  compareOrderState(
    local: LocalPositionView,
    broker: BrokerPositionView,
  ): PositionMismatch {
    if (broker.entryOrderStatus === null) {
      return notVerifiable('orderState', local.tradeState);
    }
    if (
      (local.tradeState === TradeState.ENTRY_PENDING ||
        local.tradeState === TradeState.WAITING_ENTRY) &&
      (broker.entryOrderStatus === OrderStatus.FILLED ||
        broker.entryOrderStatus === OrderStatus.PARTIALLY_FILLED)
    ) {
      return {
        field: 'orderState',
        level: MismatchLevel.ERROR,
        localValue: local.tradeState,
        brokerValue: broker.entryOrderStatus,
        description:
          'Broker confirms the entry order filled but the local trade never recorded it.',
      };
    }
    if (
      (local.tradeState === TradeState.ACTIVE ||
        local.tradeState === TradeState.ENTRY_FILLED) &&
      NEGATIVE_ORDER_STATUSES.has(broker.entryOrderStatus)
    ) {
      return {
        field: 'orderState',
        level: MismatchLevel.CRITICAL,
        localValue: local.tradeState,
        brokerValue: broker.entryOrderStatus,
        description:
          'Local trade believes its entry is live but the broker reports it was rejected, cancelled, or failed.',
      };
    }
    return noDifference('orderState', local.tradeState);
  },

  compareTradeState(
    local: LocalPositionView,
    broker: BrokerPositionView,
  ): PositionMismatch {
    // Mirrors compareOrderState's classification (same underlying signal) —
    // included separately because the spec lists Trade State and Order
    // State as two distinct comparison points.
    const orderState = this.compareOrderState(local, broker);
    return { ...orderState, field: 'tradeState' };
  },

  comparePositionState(
    local: LocalPositionView,
    broker: BrokerPositionView,
  ): PositionMismatch {
    const localOpen = local.openQuantity > 0;
    if (
      broker.exitOrderStatus === null &&
      broker.entryFilledQuantity === null
    ) {
      return notVerifiable('positionState', localOpen ? 'OPEN' : 'CLOSED');
    }
    const brokerClosed =
      broker.exitOrderStatus === OrderStatus.FILLED ||
      broker.exitOrderStatus === OrderStatus.EXITED;
    if (localOpen && brokerClosed) {
      return {
        field: 'positionState',
        level: MismatchLevel.ERROR,
        localValue: 'OPEN',
        brokerValue: 'CLOSED',
        description:
          'Local trade still shows an open position but the broker reports the exit already filled.',
      };
    }
    return noDifference('positionState', localOpen ? 'OPEN' : 'CLOSED');
  },
};
