import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import type { TradeRecord } from '../models/trade-record.model';
import type { NetPosition } from '../models/net-position.model';

/**
 * Aggregates multiple open trades ("lots") on the same instrument into one
 * net position — long/short, net quantity, volume-weighted average price,
 * and summed P&L/charges across every contributing lot. A pure function:
 * it takes whatever `TradeRecord`s the caller has already scoped (e.g. one
 * user's own open Paper trades) and groups purely by instrument token; it
 * never itself decides which records "belong together" beyond that, and
 * never fetches anything — see `PaperTradingService.getNetPositions` for
 * the caller that supplies a user-scoped record list.
 *
 * Same-direction lots combine into one volume-weighted average price,
 * exactly like a real position book netting multiple fills on one
 * instrument. Opposite-direction lots on the same instrument (a genuine
 * hedge/re-entry scenario) net against each other by signed quantity — the
 * resulting position takes whichever side has the larger net quantity; if
 * they exactly cancel, the position is flat and omitted entirely (there is
 * nothing open left to report).
 */
export function aggregateNetPositions(
  records: readonly TradeRecord[],
): NetPosition[] {
  const byToken = new Map<string, TradeRecord[]>();
  for (const record of records) {
    if (record.openQuantity <= 0) {
      continue;
    }
    const bucket = byToken.get(record.token);
    if (bucket) {
      bucket.push(record);
    } else {
      byToken.set(record.token, [record]);
    }
  }

  const positions: NetPosition[] = [];
  for (const lots of byToken.values()) {
    const position = aggregateOneInstrument(lots);
    if (position) {
      positions.push(position);
    }
  }
  return positions;
}

function aggregateOneInstrument(lots: TradeRecord[]): NetPosition | null {
  let signedQuantity = 0;
  let signedValue = 0;
  let totalRealizedPnl = 0;
  let totalUnrealizedPnl = 0;
  let totalCharges = 0;
  let netPnl = 0;

  for (const lot of lots) {
    const sign = lot.direction === TradeDirection.LONG ? 1 : -1;
    const price = lot.averagePrice ?? lot.entryPrice;
    signedQuantity += sign * lot.openQuantity;
    signedValue += sign * lot.openQuantity * price;
    totalRealizedPnl += lot.realizedPnl ?? 0;
    totalUnrealizedPnl += lot.unrealizedPnl ?? 0;
    totalCharges += lot.charges.total;
    netPnl += lot.netPnl ?? 0;
  }

  if (signedQuantity === 0) {
    return null;
  }

  const direction =
    signedQuantity > 0 ? TradeDirection.LONG : TradeDirection.SHORT;
  const netQuantity = Math.abs(signedQuantity);
  const averagePrice = Math.abs(signedValue / signedQuantity);
  const first = lots[0];

  return {
    instrumentToken: first.token,
    exchange: first.exchange,
    tradingSymbol: first.instrument,
    direction,
    netQuantity,
    averagePrice,
    totalRealizedPnl,
    totalUnrealizedPnl,
    totalCharges,
    netPnl,
    lotCount: lots.length,
    tradeIds: lots.map((lot) => lot.tradeId),
  };
}
