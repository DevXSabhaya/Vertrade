import { Inject, Injectable } from '@nestjs/common';
import { ORDER_EXECUTOR } from '@modules/broker/executors/order-executor.constants';
import type { IOrderExecutor } from '@modules/broker/executors/order-executor.interface';
import type { BrokerPositionView } from './models/broker-position-view.model';
import type { LocalPositionView } from './models/local-position-view.model';

/**
 * The broker's side of the comparison. `IOrderExecutor` (Phase 5) exposes no
 * "list all positions" endpoint — only per-order lookups
 * (`getOrderStatus(brokerOrderId)`) — so, rather than fabricate a broker-wide
 * positions API this system never had, a broker position view is built by
 * querying the status of the specific entry/exit order ids the local trade
 * already recorded. This is a real, broker-verified read for every field it
 * reports; it simply cannot report a position the broker knows about that
 * the local Engine has no order id for at all (which never happens under
 * this system's exactly-once order queue — every broker order originates
 * from a local trade).
 */
@Injectable()
export class BrokerPositionProvider {
  constructor(
    @Inject(ORDER_EXECUTOR) private readonly orderExecutor: IOrderExecutor,
  ) {}

  async fetch(local: LocalPositionView): Promise<BrokerPositionView> {
    const [entry, exit] = await Promise.all([
      local.entryOrderId
        ? this.orderExecutor.getOrderStatus(local.entryOrderId)
        : Promise.resolve(null),
      local.exitOrderId
        ? this.orderExecutor.getOrderStatus(local.exitOrderId)
        : Promise.resolve(null),
    ]);

    return {
      tradeId: local.tradeId,
      entryOrderStatus: entry?.status ?? null,
      entryFilledQuantity: entry?.filledQuantity ?? null,
      entryAveragePrice: entry?.averagePrice ?? null,
      exitOrderStatus: exit?.status ?? null,
      exitFilledQuantity: exit?.filledQuantity ?? null,
      exitAveragePrice: exit?.averagePrice ?? null,
    };
  }
}
